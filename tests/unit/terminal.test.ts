import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENTS_FILE, CLAUDE_FILE, CLAUDE_MD_IMPORT, DECK_AGENTS_MD, deckAgentsMd, ensureAgentFiles } from "../../src/console/agentsMd";
import { useTerminalStore, type PtyBridge } from "../../src/console/terminalStore";
import { settings } from "../../src/settings/settings";

describe("deck AGENTS.md", () => {
  it("documents the markdown conventions any agent must follow, and CLAUDE.md just imports it", () => {
    for (const s of ["deck.md", "images/", "notes/", "theme.json", "frontmatter", "# ", "## ", "img=", "layout=2col", "size=", "![TODO", "> note:", "---", "番号", ".mdslide/history/"]) {
      expect(DECK_AGENTS_MD).toContain(s);
    }
    expect(deckAgentsMd("plan.md")).toContain("`plan.md`");
    expect(CLAUDE_MD_IMPORT).toBe("@AGENTS.md\n");
  });
  it("writes AGENTS.md and the importing CLAUDE.md once, never overwriting a person's files", async () => {
    const files = new Map<string, string>();
    const backend = { exists: async (p: string) => files.has(p), writeText: async (p: string, t: string) => { files.set(p, t); return 1; } };
    expect(await ensureAgentFiles(backend, "plan.md")).toEqual({ agents: true, claude: true });
    expect(files.get(AGENTS_FILE)).toBe(deckAgentsMd("plan.md"));
    expect(files.get(CLAUDE_FILE)).toBe(CLAUDE_MD_IMPORT);
    files.set(AGENTS_FILE, "custom");
    files.delete(CLAUDE_FILE);
    expect(await ensureAgentFiles(backend)).toEqual({ agents: false, claude: true }); // each file on its own
    expect(files.get(AGENTS_FILE)).toBe("custom");
    expect(files.get(CLAUDE_FILE)).toBe(CLAUDE_MD_IMPORT);
  });
});

function fakePty() {
  const listeners: { data: ((id: number, d: string) => void)[]; exit: ((id: number, c: number) => void)[] } = { data: [], exit: [] };
  const b: PtyBridge & { listeners: typeof listeners; spawned: unknown[]; written: string[] } = {
    listeners, spawned: [], written: [],
    spawn: vi.fn(async (opts) => { b.spawned.push(opts); return 7; }),
    write: vi.fn(async (_id, d) => { b.written.push(d); }),
    resize: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
    onData: (cb) => { listeners.data.push(cb); return () => undefined; },
    onExit: (cb) => { listeners.exit.push(cb); return () => undefined; },
  };
  return b;
}

describe("terminalStore", () => {
  beforeEach(async () => { localStorage.clear(); await settings.load(); useTerminalStore.getState().reset(); (await import("../../src/console/toolsStore")).useToolsStore.getState().reset(); });

  it("spawns a shell in the workspace and auto-runs claude once", async () => {
    const b = fakePty();
    const s = useTerminalStore.getState();
    await s.start(b, "/w/deck", 120, 30);
    expect(b.spawned[0]).toEqual({ cwd: "/w/deck", cols: 120, rows: 30 });
    expect(useTerminalStore.getState().ptyId).toBe(7);
    expect(b.written).toEqual(["claude\r"]);
    // a second start on the same pty is a no-op
    await useTerminalStore.getState().start(b, "/w/deck", 120, 30);
    expect(b.spawn).toHaveBeenCalledTimes(1);
  });
  it("respects the auto-start preference and launches the selected tool", async () => {
    useTerminalStore.getState().setAutoStart(false);
    expect(settings.get().console.autoStart).toBe(false);
    const b = fakePty();
    await useTerminalStore.getState().start(b, "/w", 80, 24);
    expect(b.written).toEqual([]);
    await useTerminalStore.getState().runTool();
    expect(b.written).toEqual(["claude\r"]);
    const { useToolsStore } = await import("../../src/console/toolsStore");
    useToolsStore.getState().update("aider", { args: "--model sonnet" });
    await useTerminalStore.getState().runTool("aider");
    expect(b.written.at(-1)).toBe("aider --model sonnet\r");
    useToolsStore.getState().select("codex");
    await useTerminalStore.getState().runTool();
    expect(b.written.at(-1)).toBe("codex\r");
    useToolsStore.getState().reset();
  });
  it("marks exit, allows restart, and forwards resize/kill", async () => {
    const b = fakePty();
    await useTerminalStore.getState().start(b, "/w", 80, 24);
    b.listeners.exit.forEach((f) => f(7, 0));
    expect(useTerminalStore.getState().ptyId).toBeNull();
    expect(useTerminalStore.getState().exitCode).toBe(0);
    expect(useTerminalStore.getState().status).toBe("exited");
    b.listeners.exit.forEach((f) => f(99, 1)); // other pty: ignored
    expect(useTerminalStore.getState().exitCode).toBe(0);
    await useTerminalStore.getState().start(b, "/w", 80, 24);
    expect(b.spawn).toHaveBeenCalledTimes(2);
    await useTerminalStore.getState().resize(100, 40);
    expect(b.resize).toHaveBeenCalledWith(7, 100, 40);
    await useTerminalStore.getState().stop();
    expect(b.kill).toHaveBeenCalledWith(7);
    expect(useTerminalStore.getState().ptyId).toBeNull();
    expect(useTerminalStore.getState().status).toBe("stopped");
  });
  it("persists open state and height", () => {
    const s = useTerminalStore.getState();
    s.toggle(); expect(useTerminalStore.getState().open).toBe(false); expect(settings.get().console.open).toBe(false);
    s.setHeight(333); expect(settings.get().console.height).toBe(333);
    useTerminalStore.getState().reset();
    expect(useTerminalStore.getState().open).toBe(false);
    expect(useTerminalStore.getState().height).toBe(333);
  });
});
