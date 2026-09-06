import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";

/**
 * Pseudo-terminal sessions for the console pane.
 * Preferred: node-pty loaded in this process (needs `electron-rebuild`, see package.json postinstall).
 * Fallback: node-pty inside a system `node` host process (electron/ptyHost.cjs), so the terminal still works when
 * the native module was built for a different ABI.
 */
export interface PtySession { write(d: string): void; resize(c: number, r: number): void; kill(): void }
export interface PtyEvents { onData(id: number, d: string): void; onExit(id: number, code: number): void }

export function defaultShell(): { shell: string; args: string[] } {
  if (process.platform === "win32") return { shell: process.env.COMSPEC || "cmd.exe", args: [] };
  return { shell: process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"), args: ["-l"] };
}

/** Env for the shell: strip Electron-specific variables that confuse tools. */
export function shellEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", LANG: process.env.LANG || "ja_JP.UTF-8", MDSLIDE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

type NodePty = typeof import("node-pty");
let nativePty: NodePty | null | undefined;
function loadNative(): NodePty | null {
  if (nativePty !== undefined) return nativePty;
  try { nativePty = createRequire(__filename)("node-pty") as NodePty; } catch { nativePty = null; }
  return nativePty;
}

let seq = 0;
const sessions = new Map<number, PtySession>();
let host: ChildProcess | null = null;
let hostEvents: PtyEvents | null = null;

function ensureHost(events: PtyEvents, hostScript: string, nodeBin: string): ChildProcess {
  if (host && host.exitCode === null) { hostEvents = events; return host; }
  const require = createRequire(__filename);
  const ptyDir = path.dirname(require.resolve("node-pty/package.json"));
  host = spawn(nodeBin, [hostScript], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NODE_PATH: path.dirname(ptyDir) } });
  hostEvents = events;
  readline.createInterface({ input: host.stdout! }).on("line", (line) => {
    let m: { type: string; id: number; data?: string; code?: number; message?: string };
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === "data") hostEvents?.onData(m.id, m.data ?? "");
    else if (m.type === "exit") { sessions.delete(m.id); hostEvents?.onExit(m.id, m.code ?? -1); }
    else if (m.type === "error") hostEvents?.onData(m.id ?? 0, `\r\n[pty] ${m.message}\r\n`);
  });
  host.stderr!.on("data", (d) => hostEvents?.onData(0, `\r\n[pty host] ${d}`));
  host.on("exit", () => { for (const id of sessions.keys()) hostEvents?.onExit(id, -1); sessions.clear(); host = null; });
  return host;
}

export interface SpawnOptions { cwd: string; cols: number; rows: number; events: PtyEvents; hostScript: string; nodeBin?: string }

/** Returns the session id. Throws when neither backend is available. */
export function spawnPty(o: SpawnOptions): number {
  const id = ++seq;
  const { shell, args } = defaultShell();
  const native = loadNative();
  if (native) {
    const p = native.spawn(shell, args, { name: "xterm-256color", cwd: o.cwd, cols: o.cols, rows: o.rows, env: shellEnv() as Record<string, string> });
    p.onData((d) => o.events.onData(id, d));
    p.onExit(({ exitCode }) => { sessions.delete(id); o.events.onExit(id, exitCode); });
    sessions.set(id, { write: (d) => p.write(d), resize: (c, r) => p.resize(c, r), kill: () => p.kill() });
    return id;
  }
  const h = ensureHost(o.events, o.hostScript, o.nodeBin ?? "node");
  const sendMsg = (m: object) => h.stdin!.write(JSON.stringify(m) + "\n");
  sendMsg({ type: "spawn", id, cwd: o.cwd, cols: o.cols, rows: o.rows, shell, args, env: shellEnv() });
  sessions.set(id, {
    write: (d) => sendMsg({ type: "write", id, data: d }),
    resize: (c, r) => sendMsg({ type: "resize", id, cols: c, rows: r }),
    kill: () => sendMsg({ type: "kill", id }),
  });
  return id;
}

export const ptyBackend = (): "native" | "host" => (loadNative() ? "native" : "host");
export const getSession = (id: number) => sessions.get(id);
export function killAll() { for (const s of sessions.values()) s.kill(); sessions.clear(); host?.kill(); host = null; }
