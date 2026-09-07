import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Simulates the preload bridge with an in-memory folder. */
const files = new Map<string, string>();
const api = vi.hoisted(() => {
  const files = new Map<string, string>();
  const listeners: ((rel: string) => void)[] = [];
  const api = {
    platform: "darwin", files, listeners,
    initialWorkspace: vi.fn(async (): Promise<{ root: string; deckFile: string | null } | null> => ({ root: "/w/deck", deckFile: null })),
    settingsPath: async () => "/w/.config/mdslide/settings.json",
    settingsRead: async () => files.get("settings.json") ?? null,
    settingsWrite: async (t: string) => { files.set("settings.json", t); },
    openFolder: vi.fn(async (): Promise<string | null> => "/w/deck"),
    openMarkdown: vi.fn(async (): Promise<string | null> => "/w/plans/q3.md"),
    readText: async (p: string) => files.has(p) ? { text: files.get(p)!, modified: 1 } : null,
    readFile: async (p: string) => files.has(p) ? { data: new TextEncoder().encode(files.get(p)!), modified: 1 } : null,
    writeText: async (p: string, t: string) => { files.set(p, t); return Date.now(); },
    writeFile: async (p: string, d: Uint8Array) => { files.set(p, new TextDecoder().decode(d)); return Date.now(); },
    modified: async (p: string): Promise<number | null> => files.has(p) ? 1 : null,
    exists: async (p: string) => files.has(p) || p === "/w/deck",
    mkdir: async () => undefined, watch: async () => undefined, unwatch: async () => undefined,
    list: async () => [] as string[], remove: async () => undefined,
    mastersResolve: async (dir: string | null) => dir ?? "/w/.config/mdslide/masters", importMaster: async () => null as string | null,
    onChanged: (cb: (rel: string) => void) => { listeners.push(cb); return () => undefined; },
    runExport: vi.fn(async () => ({ code: 0, stdout: "wrote", stderr: "warning: one\n" })),
    showItem: vi.fn(async () => undefined), openPath: async () => "",
    ptySpawn: vi.fn(async () => 1), ptyWrite: vi.fn(async () => undefined), ptyResize: vi.fn(async () => undefined), ptyKill: vi.fn(async () => undefined),
    ptyBackend: async () => "host" as const, onPtyData: (_cb: unknown) => () => undefined, onPtyExit: (_cb: unknown) => () => undefined,
  };
  (window as unknown as { mdslide: unknown }).mdslide = api;
  return api;
});
void files;

vi.mock("@xterm/xterm", () => ({ Terminal: class { cols = 80; rows = 24; options = {}; loadAddon() {} open() {} focus() {} dispose() {} write() {} onData() { return { dispose() {} }; } } }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
import { App } from "../../src/components/App";
import { useDeckStore } from "../../src/store/deckStore";

afterEach(() => cleanup());

describe("App in Electron", () => {
  it("restores the folder from argv, runs the exporter, and reacts to watcher events", async () => {
    api.files.set("settings.json", JSON.stringify({ version: 1, help: { seen: true } }));
    render(<App />);
    expect(document.body.classList.contains("electron")).toBe(true);
    await screen.findByRole("button", { name: "deck/deck.md" }, { timeout: 4000 });
    expect(api.files.get("/w/deck/deck.md")).toContain("title:");
    expect(api.files.get("/w/deck/AGENTS.md")).toContain("deck.md");   // conventions for any interactive agent
    expect(api.files.get("/w/deck/CLAUDE.md")).toBe("@AGENTS.md\n");   // Claude Code imports the same file
    expect(api.ptySpawn).toHaveBeenCalledWith({ cwd: "/w/deck", cols: 80, rows: 24 });
    expect(api.ptyWrite).toHaveBeenCalledWith(1, "claude\r");
    // the last folder is remembered in the settings file
    const { settings } = await import("../../src/settings/settings");
    await settings.flush();
    expect(JSON.parse(api.files.get("settings.json")!).workspace.lastPath).toBe("/w/deck");

    // no master.pptx yet: export writes deck.json but refuses to run python
    await userEvent.click(screen.getByRole("button", { name: "書き出す" }));
    expect(await screen.findByText(/書き出しにはマスターが必要/)).toBeInTheDocument();
    expect(api.runExport).not.toHaveBeenCalled();

    // with master.pptx: exporter runs, result banner shows warnings, Finder reveal is requested
    api.files.set("/w/deck/master.pptx", "not-a-real-pptx");
    await userEvent.click(screen.getByRole("button", { name: "書き出す" }));
    expect(await screen.findByText(/out\/deck\.pptx を生成しました/)).toBeInTheDocument();
    expect(screen.getByText(/警告: 1件/)).toBeInTheDocument();
    expect(api.showItem).toHaveBeenCalledWith("/w/deck/out/deck.pptx");

    // exporter failure surfaces stderr tail
    api.runExport.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "Traceback\nboom" });
    await userEvent.click(screen.getByRole("button", { name: "書き出す" }));
    expect(await screen.findByText(/生成に失敗しました \(1\)/)).toBeInTheDocument();

    // watcher: deck.md rewritten on disk while clean -> reloaded
    api.files.set("/w/deck/deck.md", "---\ntitle: Watched\n---\n\n## W\n");
    api.modified = async () => Date.now() + 100000;
    api.listeners.forEach((cb) => cb("deck.md"));
    await waitFor(() => expect(useDeckStore.getState().deck.meta.title).toBe("Watched"));
    // the bogus master.pptx is reported, not fatal
    expect(await screen.findByText(/master\.pptx を読み込めませんでした/)).toBeInTheDocument();
  });

  it("shows the start screen when nothing is restored, and opens a Markdown file as the workspace", async () => {
    api.files.clear();
    api.files.set("settings.json", JSON.stringify({ version: 1, help: { seen: true }, workspace: { lastPath: null, recent: [{ path: "/w/old", deckFile: "old.md" }] } }));
    api.files.set("/w/plans/q3.md", "---\ntitle: Q3\n---\n\n## Plan\n");
    api.initialWorkspace.mockResolvedValueOnce(null);
    useDeckStore.setState({ workspace: null, started: false });
    render(<App />);
    expect(await screen.findByRole("button", { name: "Markdown を開く" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新しく作る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "サンプルを見る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "old.md" })).toBeInTheDocument(); // recent list
    expect(screen.queryByText("1. 背景と目的")).toBeNull(); // no silent sample
    await userEvent.click(screen.getByRole("button", { name: "Markdown を開く" }));
    await screen.findByRole("button", { name: "plans/q3.md" }, { timeout: 4000 });
    expect(useDeckStore.getState().deck.meta.title).toBe("Q3");
    expect(useDeckStore.getState().workspace).toMatchObject({ path: "/w/plans", deckFile: "q3.md" });
    expect(api.files.get("/w/plans/AGENTS.md")).toContain("q3.md");
    const { settings } = await import("../../src/settings/settings");
    expect(settings.get().workspace.recent[0]).toEqual({ path: "/w/plans", deckFile: "q3.md" });
  });

  it("「新しく作る」 picks a folder and scaffolds its deck.md as an empty frame titled after the folder, not the sample", async () => {
    api.files.clear();
    api.files.set("settings.json", JSON.stringify({ version: 1, help: { seen: true } }));
    api.initialWorkspace.mockResolvedValueOnce(null);
    api.openFolder.mockResolvedValueOnce("/w/talk");
    useDeckStore.setState({ workspace: null, started: false });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "新しく作る" }, { timeout: 4000 }));
    await screen.findByRole("button", { name: "talk/deck.md" }, { timeout: 4000 });
    expect(api.openFolder).toHaveBeenLastCalledWith(expect.objectContaining({ buttonLabel: "ここに作る" }));
    const written = api.files.get("/w/talk/deck.md")!;
    expect(written).toContain("title: talk");
    expect(written).toContain("# 章タイトル");
    expect(written).not.toContain("パイプライン改善"); // not the built-in sample
    expect(useDeckStore.getState().deck.meta.title).toBe("talk");
    expect(useDeckStore.getState().markdown).toBe(written); // the editor shows the new deck, not what was open before
    expect(api.files.get("/w/talk/AGENTS.md")).toContain("deck.md");
    expect(api.files.get("/w/talk/CLAUDE.md")).toBe("@AGENTS.md\n");
  });
});
