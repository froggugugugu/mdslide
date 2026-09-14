import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from "electron";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { AllowedPaths } from "./paths";
import { defaultShell, getSession, killAll, ptyBackend, spawnPty } from "./pty";
import { checkPython, type PythonCheck } from "./python";

/**
 * Main process: owns the file system. The renderer only sees the API in preload.ts.
 * Paths are always absolute; the renderer keeps the workspace root and joins relative names.
 * The file IPC reaches only what the person opened (`allowed`, ADR-0026).
 */
let win: BrowserWindow | null = null;
let watcher: FSWatcher | null = null;
const allowed = new AllowedPaths();

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 640,
    title: "mdslide",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: process.platform === "darwin" ? "sidebar" : undefined,
    visualEffectState: "active",
    backgroundColor: process.platform === "darwin" ? "#00000000" : "#f5f5f7",
    // Sandboxed renderer; the preload is built as CommonJS for that (electron.vite.config.ts). ADR-0026.
    webPreferences: { preload: path.join(__dirname, "../preload/preload.cjs"), contextIsolation: true, sandbox: true },
  });
  // The dev server URL is for `electron-vite dev` only: the packaged app always loads its own files.
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"));
  win.on("closed", () => { win = null; });
}

/** No new windows, no navigating away from the app's page, no webviews: nothing in a deck can take the window elsewhere (ADR-0026). */
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (e, url) => { if (url !== contents.getURL()) e.preventDefault(); });
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

/**
 * Application menu: the standard roles plus the two sheets the renderer owns (設定… ⌘, and 使い方 ⌘/).
 * The renderer handles those keys itself and prevents the default, so the accelerators here are for discoverability and the mouse.
 */
function buildMenu() {
  const tell = (channel: string) => () => (BrowserWindow.getFocusedWindow() ?? win)?.webContents.send(channel);
  const settingsItem: MenuItemConstructorOptions = { label: "設定…", accelerator: "CmdOrCtrl+,", click: tell("app:open-settings") };
  const mac = process.platform === "darwin";
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [{ role: "about" }, { type: "separator" }, settingsItem, { type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }],
  };
  const fileMenu: MenuItemConstructorOptions = { label: "ファイル", submenu: [...(mac ? [] : [settingsItem, { type: "separator" } as MenuItemConstructorOptions]), { role: "close" }] };
  const helpMenu: MenuItemConstructorOptions = { role: "help", submenu: [{ label: "mdslide の使い方", accelerator: "CmdOrCtrl+/", click: tell("app:open-help") }] };
  Menu.setApplicationMenu(Menu.buildFromTemplate([...(mac ? [appMenu] : []), fileMenu, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }, helpMenu]));
}

app.whenReady().then(async () => {
  // The packaged app carries build/icon.icns; in development the Dock would otherwise show Electron's own icon.
  if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(path.join(app.getAppPath(), "build", "icon.png"));
  await allowFromSettings();
  buildMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
/** The appearance setting (auto / light / dark) drives nativeTheme so the sidebar vibrancy and prefers-color-scheme match the page. */
ipcMain.handle("theme:set", (_e, theme: "auto" | "light" | "dark") => { nativeTheme.themeSource = theme === "auto" ? "system" : theme; });

/** Throws unless every path is inside what the person opened (ADR-0026). */
async function guard(...paths: unknown[]): Promise<void> {
  for (const p of paths) if (!(await allowed.allows(p))) throw new Error(`mdslide: 開いたフォルダの外は扱えません: ${String(p)}`);
}

/** A deck as its folder (deckFile null: the default deck.md) or as a Markdown file in its folder; null for anything else. */
async function deckEntry(p: string): Promise<{ root: string; deckFile: string | null } | null> {
  try {
    const abs = path.resolve(p);
    const st = await fs.stat(abs);
    if (st.isDirectory()) return { root: abs, deckFile: null };
    if (st.isFile() && /\.(md|markdown)$/i.test(abs)) return { root: path.dirname(abs), deckFile: path.basename(abs) };
  } catch { /* neither a folder nor a file */ }
  return null;
}

/** Folder or Markdown file given on the command line (`mdslide ./deck-folder`, `mdslide ./talk.md`) or via MDSLIDE_WORKSPACE. */
async function initialWorkspace(): Promise<{ root: string; deckFile: string | null } | null> {
  const candidates = [process.env.MDSLIDE_WORKSPACE, ...process.argv.slice(1).filter((a) => !a.startsWith("-"))].filter((x): x is string => !!x);
  for (const c of candidates) {
    if (path.resolve(c) === app.getAppPath()) continue; // "electron ." passes the app dir itself
    const entry = await deckEntry(c);
    if (entry) return entry;
  }
  return null;
}
ipcMain.handle("workspace:initial", async () => {
  const w = await initialWorkspace();
  allowed.allow(w?.root);
  return w;
});

/** Settings file: MDSLIDE_CONFIG or $XDG_CONFIG_HOME/mdslide/settings.json (default ~/.config/mdslide/settings.json). */
export function settingsPath(): string {
  if (process.env.MDSLIDE_CONFIG) return path.resolve(process.env.MDSLIDE_CONFIG);
  const base = process.env.XDG_CONFIG_HOME || path.join(app.getPath("home"), ".config");
  return path.join(base, "mdslide", "settings.json");
}
const defaultMastersDir = () => path.join(path.dirname(settingsPath()), "masters");

/**
 * What settings.json already names, read before the window opens: the recent decks, the chosen masters folder, and the
 * settings file itself (設定の「設定ファイルを開く」). The renderer cannot widen this during the current run.
 */
async function allowFromSettings() {
  allowed.allow(settingsPath());
  allowed.allow(defaultMastersDir());
  try {
    const s = JSON.parse(await fs.readFile(settingsPath(), "utf8"));
    allowed.allow(s?.workspace?.lastPath);
    for (const r of Array.isArray(s?.workspace?.recent) ? s.workspace.recent : []) allowed.allow(r?.path);
    allowed.allow(s?.masters?.dir);
  } catch { /* no settings yet */ }
}

ipcMain.handle("settings:path", () => settingsPath());
ipcMain.handle("settings:read", async () => { try { return await fs.readFile(settingsPath(), "utf8"); } catch { return null; } });
ipcMain.handle("settings:write", async (_e, text: string) => {
  const p = settingsPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, p); // atomic replace so a crash never leaves a half-written file
});

ipcMain.handle("dialog:openFolder", async (_e, opts?: { title?: string; buttonLabel?: string; message?: string }) => {
  const r = await dialog.showOpenDialog({ title: opts?.title, buttonLabel: opts?.buttonLabel, message: opts?.message, properties: ["openDirectory", "createDirectory"] });
  if (r.canceled) return null;
  allowed.allow(r.filePaths[0]);
  return r.filePaths[0];
});
/** Masters live in one folder (settings masters.dir, default <config dir>/masters) so they can be managed like any other files. */
async function mastersDir(configured: string | null): Promise<string> {
  const dir = configured ? path.resolve(configured) : defaultMastersDir();
  await guard(dir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
ipcMain.handle("masters:resolve", (_e, configured: string | null) => mastersDir(configured));
ipcMain.handle("dialog:importMaster", async (_e, dir: string) => {
  await guard(dir);
  const r = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "PowerPoint", extensions: ["pptx", "potx"] }] });
  if (r.canceled) return null;
  const name = path.basename(r.filePaths[0]);
  await fs.copyFile(r.filePaths[0], path.join(dir, name));
  return name;
});

const MARKDOWN_FILTER = [{ name: "Markdown", extensions: ["md", "markdown"] }];
/**
 * 資料を開く: one panel takes the deck's folder or a Markdown file in it (ADR-0029). Only the macOS panel offers files and
 * folders together; elsewhere a file panel still reaches every deck through its Markdown file.
 */
ipcMain.handle("dialog:openDeck", async () => {
  const r = await dialog.showOpenDialog({
    title: "資料を開く", buttonLabel: "開く", message: "資料のフォルダか、その中の Markdown ファイルを選びます。",
    properties: process.platform === "darwin" ? ["openFile", "openDirectory"] : ["openFile"], filters: MARKDOWN_FILTER,
  });
  if (r.canceled) return null;
  const entry = await deckEntry(r.filePaths[0]);
  allowed.allow(entry?.root);
  return entry;
});

ipcMain.handle("fs:readText", async (_e, p: string) => {
  try { await guard(p); const [text, st] = await Promise.all([fs.readFile(p, "utf8"), fs.stat(p)]); return { text, modified: st.mtimeMs }; }
  catch { return null; }
});
ipcMain.handle("fs:readFile", async (_e, p: string) => {
  try { await guard(p); const [data, st] = await Promise.all([fs.readFile(p), fs.stat(p)]); return { data, modified: st.mtimeMs }; }
  catch { return null; }
});
ipcMain.handle("fs:writeText", async (_e, p: string, text: string) => {
  await guard(p);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, text, "utf8");
  return (await fs.stat(p)).mtimeMs;
});
ipcMain.handle("fs:writeFile", async (_e, p: string, data: Uint8Array) => {
  await guard(p);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, Buffer.from(data));
  return (await fs.stat(p)).mtimeMs;
});
ipcMain.handle("fs:modified", async (_e, p: string) => { try { await guard(p); return (await fs.stat(p)).mtimeMs; } catch { return null; } });
ipcMain.handle("fs:exists", async (_e, p: string) => { try { await guard(p); await fs.access(p); return true; } catch { return false; } });
ipcMain.handle("fs:list", async (_e, p: string) => {
  try { await guard(p); return (await fs.readdir(p, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name); } catch { return []; }
});
ipcMain.handle("fs:remove", async (_e, p: string) => { await guard(p); await fs.rm(p, { force: true }); });
ipcMain.handle("fs:mkdir", async (_e, p: string) => { await guard(p); await fs.mkdir(p, { recursive: true }); });

/** Watch a workspace root; the renderer receives relative paths of changed files. */
ipcMain.handle("watch:start", async (_e, root: string) => {
  await guard(root);
  await watcher?.close();
  watcher = chokidar.watch(root, { ignoreInitial: true, depth: 2, ignored: /(^|[/\\])(\.|node_modules|out[/\\])/, awaitWriteFinish: { stabilityThreshold: 300 } });
  watcher.on("all", (_ev, p) => win?.webContents.send("watch:changed", path.relative(root, p).split(path.sep).join("/")));
});
ipcMain.handle("watch:stop", async () => { await watcher?.close(); watcher = null; });

/**
 * The Python for the exporter (electron/python.ts, ADR-0019): an explicit choice (MDSLIDE_PYTHON, settings export.python),
 * else mdslide's own venv next to settings.json, PATH and the usual places on a Mac. The last result is remembered.
 */
let lastPythonCheck: PythonCheck | null = null;
async function configuredPython(): Promise<string | null> {
  try {
    const v = JSON.parse(await fs.readFile(settingsPath(), "utf8"))?.export?.python;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch { return null; }
}
async function runPythonCheck(): Promise<PythonCheck> {
  lastPythonCheck = await checkPython({ env: process.env, home: app.getPath("home"), configDir: path.dirname(settingsPath()), configured: await configuredPython(), platform: process.platform });
  return lastPythonCheck;
}
ipcMain.handle("python:check", () => runPythonCheck());

/** Run tools/export_pptx.py inside the workspace with the Python the check found (checked again when the last one was not usable). */
ipcMain.handle("export:run", async (_e, root: string, deckJson: string, master: string, output: string) => {
  await guard(root, deckJson, master, output);
  const script = app.isPackaged
    ? path.join(process.resourcesPath, "tools", "export_pptx.py")
    : path.join(app.getAppPath(), "tools", "export_pptx.py");
  const python = (lastPythonCheck?.ok ? lastPythonCheck : await runPythonCheck()).python ?? "python3";
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(python, [script, deckJson, "--master", master, "-o", output, "--assets", root], { cwd: root });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: `${err.message}\n${stderr}` }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
});
/** Terminal sessions for the console pane. */
const ptyEvents = {
  onData: (id: number, data: string) => win?.webContents.send("pty:data", { id, data }),
  onExit: (id: number, code: number) => win?.webContents.send("pty:exit", { id, code }),
};
ipcMain.handle("pty:spawn", async (_e, opts: { cwd: string; cols: number; rows: number }) => {
  await guard(opts?.cwd);
  const hostScript = app.isPackaged ? path.join(process.resourcesPath, "pty", "ptyHost.cjs") : path.join(app.getAppPath(), "electron", "ptyHost.cjs");
  return spawnPty({ cwd: opts.cwd, cols: opts.cols, rows: opts.rows, events: ptyEvents, hostScript, nodeBin: process.env.MDSLIDE_NODE || "node" });
});
ipcMain.handle("pty:write", (_e, id: number, data: string) => getSession(id)?.write(data));
ipcMain.handle("pty:resize", (_e, id: number, cols: number, rows: number) => getSession(id)?.resize(cols, rows));
ipcMain.handle("pty:kill", (_e, id: number) => getSession(id)?.kill());
ipcMain.handle("pty:backend", () => ptyBackend());
/** The process in the foreground of a session and the shell it started with: the drawer only types prompts into a tool (ADR-0026). */
ipcMain.handle("pty:foreground", async (_e, id: number) => {
  const s = getSession(id);
  return s ? { name: await s.foreground(), shell: path.basename(defaultShell().shell) } : null;
});
app.on("before-quit", () => killAll());
ipcMain.handle("shell:showItem", async (_e, p: string) => { await guard(p); shell.showItemInFolder(p); });
/** Opens documents only (settings.json today): opening an app or a .command inside a received folder would run it. */
ipcMain.handle("shell:openPath", async (_e, p: string) => {
  await guard(p);
  if (!/\.(json|md|markdown|pptx)$/i.test(p)) throw new Error(`mdslide: この種類のファイルは開きません: ${p}`);
  return shell.openPath(p);
});
