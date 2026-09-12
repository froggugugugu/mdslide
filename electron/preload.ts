import { contextBridge, ipcRenderer } from "electron";
import type { PythonCheck } from "./python";

/** The only surface the renderer can reach. Mirrors src/workspace/electronApi.d.ts. */
const api = {
  settingsPath: (): Promise<string> => ipcRenderer.invoke("settings:path"),
  settingsRead: (): Promise<string | null> => ipcRenderer.invoke("settings:read"),
  settingsWrite: (text: string): Promise<void> => ipcRenderer.invoke("settings:write", text),
  initialWorkspace: (): Promise<{ root: string; deckFile: string | null } | null> => ipcRenderer.invoke("workspace:initial"),
  /** Folder picker (can create a folder in the dialog). The caption tells the person what the folder is for. */
  openFolder: (opts?: { title?: string; buttonLabel?: string; message?: string }): Promise<string | null> => ipcRenderer.invoke("dialog:openFolder", opts),
  openMarkdown: (): Promise<string | null> => ipcRenderer.invoke("dialog:openMarkdown"),
  mastersResolve: (configured: string | null): Promise<string> => ipcRenderer.invoke("masters:resolve", configured),
  importMaster: (dir: string): Promise<string | null> => ipcRenderer.invoke("dialog:importMaster", dir),
  readText: (p: string): Promise<{ text: string; modified: number } | null> => ipcRenderer.invoke("fs:readText", p),
  readFile: (p: string): Promise<{ data: Uint8Array; modified: number } | null> => ipcRenderer.invoke("fs:readFile", p),
  writeText: (p: string, text: string): Promise<number> => ipcRenderer.invoke("fs:writeText", p, text),
  writeFile: (p: string, data: Uint8Array): Promise<number> => ipcRenderer.invoke("fs:writeFile", p, data),
  modified: (p: string): Promise<number | null> => ipcRenderer.invoke("fs:modified", p),
  exists: (p: string): Promise<boolean> => ipcRenderer.invoke("fs:exists", p),
  list: (p: string): Promise<string[]> => ipcRenderer.invoke("fs:list", p),
  remove: (p: string): Promise<void> => ipcRenderer.invoke("fs:remove", p),
  mkdir: (p: string): Promise<void> => ipcRenderer.invoke("fs:mkdir", p),
  watch: (root: string): Promise<void> => ipcRenderer.invoke("watch:start", root),
  unwatch: (): Promise<void> => ipcRenderer.invoke("watch:stop"),
  onChanged: (cb: (rel: string) => void): (() => void) => {
    const h = (_e: unknown, rel: string) => cb(rel);
    ipcRenderer.on("watch:changed", h);
    return () => ipcRenderer.removeListener("watch:changed", h);
  },
  runExport: (root: string, deckJson: string, master: string, output: string): Promise<{ code: number; stdout: string; stderr: string }> =>
    ipcRenderer.invoke("export:run", root, deckJson, master, output),
  ptySpawn: (opts: { cwd: string; cols: number; rows: number }): Promise<number> => ipcRenderer.invoke("pty:spawn", opts),
  ptyWrite: (id: number, data: string): Promise<void> => ipcRenderer.invoke("pty:write", id, data),
  ptyResize: (id: number, cols: number, rows: number): Promise<void> => ipcRenderer.invoke("pty:resize", id, cols, rows),
  ptyKill: (id: number): Promise<void> => ipcRenderer.invoke("pty:kill", id),
  ptyBackend: (): Promise<"native" | "host"> => ipcRenderer.invoke("pty:backend"),
  onPtyData: (cb: (id: number, data: string) => void): (() => void) => {
    const h = (_e: unknown, m: { id: number; data: string }) => cb(m.id, m.data);
    ipcRenderer.on("pty:data", h); return () => ipcRenderer.removeListener("pty:data", h);
  },
  onPtyExit: (cb: (id: number, code: number) => void): (() => void) => {
    const h = (_e: unknown, m: { id: number; code: number }) => cb(m.id, m.code);
    ipcRenderer.on("pty:exit", h); return () => ipcRenderer.removeListener("pty:exit", h);
  },
  /** Is there a Python with python-pptx for the exporter? Checked at launch and from the settings (electron/python.ts). */
  checkPython: (): Promise<PythonCheck> => ipcRenderer.invoke("python:check"),
  showItem: (p: string): Promise<void> => ipcRenderer.invoke("shell:showItem", p),
  openPath: (p: string): Promise<string> => ipcRenderer.invoke("shell:openPath", p),
  /** Appearance setting → nativeTheme, so the window chrome and vibrancy follow the page. */
  setTheme: (theme: "auto" | "light" | "dark"): Promise<void> => ipcRenderer.invoke("theme:set", theme),
  /** The application menu asks the window to open one of its sheets (設定… ⌘, / 使い方 ⌘/). */
  onOpenSettings: (cb: () => void): (() => void) => {
    const h = () => cb();
    ipcRenderer.on("app:open-settings", h); return () => ipcRenderer.removeListener("app:open-settings", h);
  },
  onOpenHelp: (cb: () => void): (() => void) => {
    const h = () => cb();
    ipcRenderer.on("app:open-help", h); return () => ipcRenderer.removeListener("app:open-help", h);
  },
  platform: process.platform,
};
contextBridge.exposeInMainWorld("mdslide", api);
export type MdslideApi = typeof api;
