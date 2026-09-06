import { create } from "zustand";
import { commandLine, useToolsStore } from "./toolsStore";
import { settings } from "../settings/settings";

/** Pseudo-terminal bridge exposed by the Electron backend. */
export interface PtyBridge {
  spawn(opts: { cwd: string; cols: number; rows: number }): Promise<number>;
  write(id: number, data: string): Promise<void>;
  resize(id: number, cols: number, rows: number): Promise<void>;
  kill(id: number): Promise<void>;
  onData(cb: (id: number, data: string) => void): () => void;
  onExit(cb: (id: number, code: number) => void): () => void;
}

interface TerminalState {
  open: boolean;
  height: number;
  /** Launch the selected CLI tool when the shell starts. */
  autoStart: boolean;
  ptyId: number | null;
  exitCode: number | null;
  /** idle: never started in this window; running; exited: shell ended by itself; stopped: user pressed 終了. */
  status: "idle" | "running" | "exited" | "stopped";
  bridge: PtyBridge | null;
  /** Data listener registered by the terminal view. */
  onData: ((data: string) => void) | null;

  start: (bridge: PtyBridge, cwd: string, cols: number, rows: number) => Promise<void>;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  stop: () => Promise<void>;
  /** Run the selected tool (or a specific one) in the shell. */
  runTool: (id?: string) => Promise<void>;
  setOnData: (cb: ((data: string) => void) | null) => void;
  toggle: () => void;
  setHeight: (h: number) => void;
  setAutoStart: (v: boolean) => void;
  reset: () => void;
}

const read = () => ({ ...settings.get().console });

let offData: (() => void) | null = null;
let offExit: (() => void) | null = null;

export const useTerminalStore = create<TerminalState>((set, get) => {
  settings.subscribe((v) => set({ ...v.console }));
  return {
  ...read(), ptyId: null, exitCode: null, status: "idle", bridge: null, onData: null,

  start: async (bridge, cwd, cols, rows) => {
    if (get().ptyId !== null) return;
    offData?.(); offExit?.();
    offData = bridge.onData((id, data) => { if (id === get().ptyId) get().onData?.(data); });
    offExit = bridge.onExit((id, code) => { if (id === get().ptyId) set({ ptyId: null, exitCode: code, status: "exited" }); });
    const id = await bridge.spawn({ cwd, cols, rows });
    set({ bridge, ptyId: id, exitCode: null, status: "running" });
    if (get().autoStart) await bridge.write(id, commandLine(useToolsStore.getState().selected()) + "\r");
  },
  write: async (data) => { const { bridge, ptyId } = get(); if (bridge && ptyId !== null) await bridge.write(ptyId, data); },
  resize: async (cols, rows) => { const { bridge, ptyId } = get(); if (bridge && ptyId !== null) await bridge.resize(ptyId, cols, rows); },
  stop: async () => { const { bridge, ptyId } = get(); if (bridge && ptyId !== null) await bridge.kill(ptyId); set({ ptyId: null, status: "stopped" }); },
  runTool: async (id) => {
    const tools = useToolsStore.getState();
    const t = id ? tools.tools.find((x) => x.id === id) ?? tools.selected() : tools.selected();
    await get().write(commandLine(t) + "\r");
  },
  setOnData: (cb) => set({ onData: cb }),
  toggle: () => { const open = !get().open; settings.update((v) => { v.console.open = open; }); set({ open }); },
  setHeight: (height) => { settings.update((v) => { v.console.height = height; }); set({ height }); },
  setAutoStart: (autoStart) => { settings.update((v) => { v.console.autoStart = autoStart; }); set({ autoStart }); },
  reset: () => { offData?.(); offExit?.(); offData = offExit = null; set({ ...read(), ptyId: null, exitCode: null, status: "idle", bridge: null, onData: null }); },
  };
});
