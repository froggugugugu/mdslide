import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSettings, DEFAULT_SETTINGS, migrateFromLocalStorage, type SettingsFile } from "../../src/settings/settings";

function fileBackend(initial: string | null = null) {
  const state = { text: initial, writes: [] as string[] };
  return { state, backend: { kind: "file" as const, path: "/Users/me/.config/mdslide/settings.json", read: async () => state.text, write: async (t: string) => { state.text = t; state.writes.push(t); } } };
}

describe("settings", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });

  it("starts from defaults, loads the file and deep-merges unknown/missing keys", async () => {
    const { backend } = fileBackend(JSON.stringify({ version: 1, console: { height: 400 }, tools: { selectedId: "codex", items: [{ id: "codex", name: "Codex", command: "codex", args: "--full-auto" }] }, future: { x: 1 } }));
    const s = createSettings(backend);
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
    await s.load();
    expect(s.get().console).toEqual({ ...DEFAULT_SETTINGS.console, height: 400 });
    expect(s.get().tools.selectedId).toBe("codex");
    expect(s.get().tools.items).toEqual([{ id: "codex", name: "Codex", command: "codex", args: "--full-auto" }]);
    expect(s.get().help).toEqual(DEFAULT_SETTINGS.help);
    expect(s.loaded).toBe(true);
  });

  it("tolerates a missing or corrupt file", async () => {
    const a = createSettings(fileBackend(null).backend); await a.load();
    expect(a.get()).toEqual(DEFAULT_SETTINGS);
    const b = createSettings(fileBackend("{ not json").backend); await b.load();
    expect(b.get()).toEqual(DEFAULT_SETTINGS);
    expect(b.error).toMatch(/settings\.json/);
  });

  it("writes updates with a short debounce, pretty-printed, and notifies subscribers", async () => {
    const { state, backend } = fileBackend(null);
    const s = createSettings(backend); await s.load();
    const seen: number[] = [];
    const off = s.subscribe((v) => seen.push(v.console.height));
    s.update((v) => { v.console.height = 300; });
    s.update((v) => { v.console.height = 310; });
    expect(seen).toEqual([300, 310]);
    expect(state.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(state.writes).toHaveLength(1);
    const written = JSON.parse(state.writes[0]) as SettingsFile;
    expect(written.console.height).toBe(310);
    expect(state.writes[0]).toContain("\n  ");
    off();
    s.update((v) => { v.console.height = 320; });
    expect(seen).toEqual([300, 310]);
    await s.flush();
    expect(JSON.parse(state.text!).console.height).toBe(320);
  });

  it("reloads the file when asked (manual edits) and reports changes", async () => {
    const { state, backend } = fileBackend(null);
    const s = createSettings(backend); await s.load();
    state.text = JSON.stringify({ version: 1, tools: { selectedId: "aider" } });
    const seen: string[] = [];
    s.subscribe((v) => seen.push(v.tools.selectedId));
    await s.load();
    expect(seen).toEqual(["aider"]);
  });

  it("migrates the old localStorage keys once", () => {
    localStorage.setItem("console:height", "333"); localStorage.setItem("console:open", "0"); localStorage.setItem("console:autoStart", "0");
    localStorage.setItem("help:seen", "1"); localStorage.setItem("workspace:path", "/w/deck");
    localStorage.setItem("console:tools", JSON.stringify({ selectedId: "gemini", tools: [{ id: "claude", name: "Claude Code", command: "claude", args: "" }, { id: "tool-1", name: "T", command: "t", args: "" }] }));
    const m = migrateFromLocalStorage();
    expect(m).toEqual({ console: { height: 333, open: false, autoStart: false }, help: { seen: true }, workspace: { lastPath: "/w/deck", lastDeckFile: null, recent: [] }, tools: { selectedId: "gemini", items: [{ id: "tool-1", name: "T", command: "t", args: "" }] } });
    expect(migrateFromLocalStorage()).toBeNull(); // keys were removed
  });

  it("falls back to localStorage in the browser", async () => {
    const { localStorageBackend } = await import("../../src/settings/settings");
    const s = createSettings(localStorageBackend());
    await s.load();
    s.update((v) => { v.help.seen = true; });
    await s.flush();
    expect(JSON.parse(localStorage.getItem("mdslide:settings")!).help.seen).toBe(true);
    expect(s.backend.path).toBe("localStorage");
  });
});
