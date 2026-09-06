import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDirHandle, installFakePicker } from "../helpers/fakeFs";

// Browsers store directory handles by reference; fake-indexeddb would structured-clone them and lose methods.
const kv = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => kv.get(k), set: async (k: string, v: unknown) => { kv.set(k, v); },
  del: async (k: string) => { kv.delete(k); }, keys: async () => [...kv.keys()],
}));

// isElectron / supportsWorkspace are evaluated at import time, so import lazily per test.
async function load() { vi.resetModules(); return import("../../src/workspace/workspace"); }

describe("workspace (browser backend)", () => {
  let root: FakeDirHandle;
  beforeEach(() => { root = new FakeDirHandle("deck"); installFakePicker(root); delete (window as { mdslide?: unknown }).mdslide; });

  it("sanitizes file names", async () => {
    const { sanitize } = await load();
    expect(sanitize("2.1 計測基盤の構成 (案)")).toBe("2-1-計測基盤の構成-案");
    expect(sanitize("a/b\\c:d*e?f\"g<h>i|j")).toBe("a-b-c-d-e-f-g-h-i-j");
    expect(sanitize("x".repeat(80)).length).toBe(40);
  });

  it("picks, restores, reads and writes", async () => {
    const ws0 = await (await load()).pickWorkspace();
    expect(ws0!.name).toBe("deck");
    const m = await import("../../src/workspace/workspace");
    const ws = (await m.restoreWorkspace())!;
    expect(ws.backend.kind).toBe("browser");
    expect(await m.readText(ws, "deck.md")).toBeNull();
    const t1 = await m.writeText(ws, "deck.md", "# a\n");
    expect((await m.readText(ws, "deck.md"))!.text).toBe("# a\n");
    expect(await m.modifiedOf(ws, "deck.md")).toBe(t1);
    expect(await ws.backend.exists("deck.md")).toBe(true);
    expect(await ws.backend.exists("nope.md")).toBe(false);
  });

  it("saves images under images/ with unique names and resolves them", async () => {
    const m = await load();
    const ws = (await m.pickWorkspace())!;
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    expect(await m.saveImage(ws, png, "2.1 構成図")).toBe("images/2-1-構成図.png");
    expect(await m.saveImage(ws, png, "2.1 構成図")).toBe("images/2-1-構成図-2.png");
    expect(await m.saveImage(ws, new Blob([], { type: "image/jpeg" }), "")).toBe("images/image.jpg");
    expect(root.list("images")).toHaveLength(3);
    expect(await m.imageUrl(ws, "images/2-1-構成図.png")).toBe("blob:mock");
    expect(await m.imageUrl(ws, "images/missing.png")).toBeNull();
  });

  it("restore returns null without a stored handle", async () => {
    kv.delete("workspace:handle");
    const m = await load();
    expect(await m.restoreWorkspace()).toBeNull();
  });
});

describe("workspace (electron backend)", () => {
  it("routes everything through window.mdslide with absolute paths", async () => {
    const files = new Map<string, string>();
    const api = {
      platform: "darwin",
      initialWorkspace: vi.fn(async () => ({ root: "/Users/me/deck", deckFile: null })),
      settingsPath: async () => "/Users/me/.config/mdslide/settings.json", settingsRead: async () => null, settingsWrite: async () => undefined,
      openFolder: vi.fn(async () => "/Users/me/other"),
      openMarkdown: vi.fn(async (): Promise<string | null> => "/Users/me/plans/q3.md"),
      saveMarkdown: vi.fn(async (): Promise<string | null> => "/Users/me/new/slides.md"),
      readText: vi.fn(async (p: string) => files.has(p) ? { text: files.get(p)!, modified: 1 } : null),
      readFile: vi.fn(async (p: string) => files.has(p) ? { data: new TextEncoder().encode(files.get(p)!), modified: 1 } : null),
      writeText: vi.fn(async (p: string, t: string) => { files.set(p, t); return 2; }),
      writeFile: vi.fn(async (p: string, d: Uint8Array) => { files.set(p, new TextDecoder().decode(d)); return 3; }),
      modified: vi.fn(async (p: string) => files.has(p) ? 1 : null),
      exists: vi.fn(async (p: string) => files.has(p) || p === "/Users/me/deck"),
      mkdir: vi.fn(), watch: vi.fn(async () => undefined), unwatch: vi.fn(async () => undefined),
      onChanged: vi.fn(() => () => undefined),
      runExport: vi.fn(async () => ({ code: 0, stdout: "ok", stderr: "" })),
      showItem: vi.fn(async () => undefined), openPath: vi.fn(async () => ""),
    };
    (window as unknown as { mdslide: typeof api }).mdslide = api;
    const m = await load();
    expect(m.isElectron).toBe(true);
    const ws = (await m.restoreWorkspace())!;
    expect(ws.path).toBe("/Users/me/deck");
    expect(ws.name).toBe("deck");
    expect(ws.deckFile).toBe("deck.md");
    await m.writeText(ws, "deck.md", "x");
    expect(api.writeText).toHaveBeenCalledWith("/Users/me/deck/deck.md", "x");
    expect((await m.readText(ws, "deck.md"))!.text).toBe("x");
    await ws.backend.writeBlob("images/a.png", new Blob(["img"]));
    expect(files.get("/Users/me/deck/images/a.png")).toBe("img");
    expect((await m.readBlob(ws, "images/a.png"))!.size).toBe(3);
    const off = await ws.backend.watch!(() => undefined);
    off();
    expect(api.watch).toHaveBeenCalledWith("/Users/me/deck");
    expect(api.unwatch).toHaveBeenCalled();
    await ws.backend.runExport!("deck.json", "master.pptx", "out/deck.pptx");
    expect(api.runExport).toHaveBeenCalledWith("/Users/me/deck", "/Users/me/deck/deck.json", "/Users/me/deck/master.pptx", "/Users/me/deck/out/deck.pptx");
    const picked = (await m.pickWorkspace())!;
    expect(picked.path).toBe("/Users/me/other");
    const { settings } = await import("../../src/settings/settings");
    expect(settings.get().workspace.lastPath).toBe("/Users/me/other");
    // a Markdown file is the entry point: its folder becomes the workspace and the file keeps its name
    const md = (await m.openMarkdownFile())!;
    expect(md).toMatchObject({ path: "/Users/me/plans", name: "plans", deckFile: "q3.md" });
    const created = (await m.createMarkdownFile())!;
    expect(created).toMatchObject({ path: "/Users/me/new", name: "new", deckFile: "slides.md" });
    expect(settings.get().workspace.lastPath).toBe("/Users/me/new");
    expect(settings.get().workspace.lastDeckFile).toBe("slides.md");
    expect(settings.get().workspace.recent.map((r) => `${r.path}/${r.deckFile}`)).toEqual([
      "/Users/me/new/slides.md", "/Users/me/plans/q3.md", "/Users/me/other/deck.md", "/Users/me/deck/deck.md",
    ]);
    // cancelled dialogs open nothing
    api.openMarkdown.mockResolvedValueOnce(null); api.saveMarkdown.mockResolvedValueOnce(null);
    expect(await m.openMarkdownFile()).toBeNull();
    expect(await m.createMarkdownFile()).toBeNull();
    delete (window as { mdslide?: unknown }).mdslide;
  });

  it("restores the last file from settings only while it still exists, and accepts a .md path from argv", async () => {
    const files = new Map<string, string>([["/Users/me/plans/q3.md", "# q3"]]);
    const initial = vi.fn(async (): Promise<{ root: string; deckFile: string | null } | null> => null);
    const api = {
      platform: "darwin", initialWorkspace: initial,
      settingsPath: async () => "", settingsRead: async () => JSON.stringify({ version: 1, workspace: { lastPath: "/Users/me/plans", lastDeckFile: "q3.md" } }), settingsWrite: async () => undefined,
      openFolder: vi.fn(async () => null), openMarkdown: vi.fn(async () => null), saveMarkdown: vi.fn(async () => null),
      readText: vi.fn(async (p: string) => files.has(p) ? { text: files.get(p)!, modified: 1 } : null),
      readFile: vi.fn(async () => null), writeText: vi.fn(async () => 1), writeFile: vi.fn(async () => 1),
      modified: vi.fn(async () => null), exists: vi.fn(async (p: string) => files.has(p) || p === "/Users/me/plans" || p === "/Users/me/argv"),
      mkdir: vi.fn(), watch: vi.fn(async () => undefined), unwatch: vi.fn(async () => undefined), onChanged: vi.fn(() => () => undefined),
      runExport: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })), showItem: vi.fn(async () => undefined), openPath: vi.fn(async () => ""),
    };
    (window as unknown as { mdslide: typeof api }).mdslide = api;
    const m = await load();
    const { settings } = await import("../../src/settings/settings");
    await settings.load();
    expect(await m.restoreWorkspace()).toMatchObject({ path: "/Users/me/plans", deckFile: "q3.md" });
    files.delete("/Users/me/plans/q3.md");
    expect(await m.restoreWorkspace()).toBeNull(); // the file is gone: start screen, never a silent re-scaffold
    initial.mockResolvedValueOnce({ root: "/Users/me/argv", deckFile: "talk.md" });
    expect(await m.restoreWorkspace()).toMatchObject({ path: "/Users/me/argv", deckFile: "talk.md" }); // argv wins and may create the file
    expect(await m.openRecentWorkspace({ path: "/Users/me/plans", deckFile: "q3.md" })).toBeNull(); // missing -> null
    delete (window as { mdslide?: unknown }).mdslide;
  });
});
