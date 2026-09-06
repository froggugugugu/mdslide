/**
 * All user settings live in one JSON file so they can be edited by hand and carried between machines:
 *   macOS/Linux: $XDG_CONFIG_HOME/mdslide/settings.json (default ~/.config/mdslide/settings.json)
 *   override:    MDSLIDE_CONFIG=/path/to/settings.json
 * The browser build keeps the same document in localStorage ("mdslide:settings").
 * Unknown keys are preserved; missing keys fall back to DEFAULT_SETTINGS.
 */
import { PRESET_TOOLS, type CliTool } from "../console/presets";

/** A document the person opened: the folder and the Markdown file inside it. */
export interface RecentWorkspace { path: string; deckFile: string }

export interface SettingsFile {
  version: 1;
  workspace: { lastPath: string | null; lastDeckFile: string | null; recent: RecentWorkspace[] };
  console: { open: boolean; height: number; autoStart: boolean };
  tools: { selectedId: string; items: CliTool[] };
  help: { seen: boolean };
}

export const DEFAULT_SETTINGS: SettingsFile = {
  version: 1,
  workspace: { lastPath: null, lastDeckFile: null, recent: [] },
  console: { open: true, height: 260, autoStart: true },
  tools: { selectedId: "claude", items: [] },
  help: { seen: false },
};

export interface SettingsBackend { kind: "file" | "localStorage"; path: string; read(): Promise<string | null>; write(text: string): Promise<void> }

export function localStorageBackend(): SettingsBackend {
  return { kind: "localStorage", path: "localStorage", read: async () => localStorage.getItem("mdslide:settings"), write: async (t) => localStorage.setItem("mdslide:settings", t) };
}

export function electronBackend(): SettingsBackend {
  const api = window.mdslide!;
  return { kind: "file", path: "", read: () => api.settingsRead(), write: (t) => api.settingsWrite(t) };
}

type Plain = Record<string, unknown>;
const isObj = (v: unknown): v is Plain => !!v && typeof v === "object" && !Array.isArray(v);
function merge<T extends Plain>(base: T, over: unknown): T {
  if (!isObj(over)) return base;
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k] as Plain, v) : v;
  return out as T;
}

/** One-time import of the pre-file settings. Returns the partial document, or null when nothing was stored. */
export function migrateFromLocalStorage(): Partial<SettingsFile> | null {
  const keys = ["console:height", "console:open", "console:autoStart", "console:autoClaude", "help:seen", "workspace:path", "console:tools"];
  if (!keys.some((k) => localStorage.getItem(k) !== null)) return null;
  const out: Partial<SettingsFile> = {};
  const h = localStorage.getItem("console:height"), o = localStorage.getItem("console:open"), a = localStorage.getItem("console:autoStart") ?? localStorage.getItem("console:autoClaude");
  if (h !== null || o !== null || a !== null) out.console = { ...DEFAULT_SETTINGS.console, ...(h !== null && Number(h) ? { height: Number(h) } : {}), ...(o !== null ? { open: o !== "0" } : {}), ...(a !== null ? { autoStart: a !== "0" } : {}) };
  if (localStorage.getItem("help:seen") !== null) out.help = { seen: localStorage.getItem("help:seen") === "1" };
  if (localStorage.getItem("workspace:path") !== null) out.workspace = { ...DEFAULT_SETTINGS.workspace, lastPath: localStorage.getItem("workspace:path") };
  const t = localStorage.getItem("console:tools");
  if (t) {
    try {
      const d = JSON.parse(t) as { selectedId?: string; tools?: CliTool[] };
      // The old format stored every preset; keep only customised ones so the file stays readable.
      const items = (d.tools ?? []).filter((x) => { const p = PRESET_TOOLS.find((y) => y.id === x.id); return !p || p.name !== x.name || p.command !== x.command || p.args !== x.args; });
      out.tools = { selectedId: d.selectedId ?? "claude", items };
    } catch { /* ignore */ }
  }
  keys.forEach((k) => localStorage.removeItem(k));
  return out;
}

export interface Settings {
  backend: SettingsBackend;
  loaded: boolean;
  error: string | null;
  get(): SettingsFile;
  load(): Promise<void>;
  update(fn: (draft: SettingsFile) => void): void;
  subscribe(cb: (s: SettingsFile) => void): () => void;
  flush(): Promise<void>;
}

export function createSettings(backend: SettingsBackend, debounceMs = 300): Settings {
  let current: SettingsFile = structuredClone(DEFAULT_SETTINGS);
  let raw: Plain = {};
  const subs = new Set<(s: SettingsFile) => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const notify = () => subs.forEach((cb) => cb(current));
  const serialize = () => JSON.stringify(merge(raw, current as unknown as Plain), null, 2) + "\n";
  const writeNow = async () => { if (timer) { clearTimeout(timer); timer = null; } await backend.write(serialize()); };

  const self: Settings = {
    backend, loaded: false, error: null,
    get: () => current,
    load: async () => {
      let parsed: unknown = null;
      try {
        const text = await backend.read();
        if (text) parsed = JSON.parse(text);
        self.error = null;
      } catch (e) {
        self.error = `settings.json を読めません: ${e instanceof Error ? e.message : String(e)}`;
      }
      const migrated = parsed === null ? migrateFromLocalStorage() : null;
      raw = isObj(parsed) ? parsed : {};
      current = merge(structuredClone(DEFAULT_SETTINGS) as unknown as Plain, migrated ?? raw) as unknown as SettingsFile;
      self.loaded = true;
      if (migrated) await writeNow();
      notify();
    },
    update: (fn) => {
      const draft = structuredClone(current);
      fn(draft);
      current = draft;
      notify();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void writeNow(); }, debounceMs);
    },
    subscribe: (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    flush: writeNow,
  };
  return self;
}

/** App-wide instance. Electron writes the file; the browser build uses localStorage. */
export const settings: Settings = createSettings(typeof window !== "undefined" && window.mdslide ? electronBackend() : localStorageBackend());
