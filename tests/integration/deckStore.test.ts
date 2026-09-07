import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDirHandle, installFakePicker } from "../helpers/fakeFs";

const kv = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => kv.get(k), set: async (k: string, v: unknown) => { kv.set(k, v); },
  del: async (k: string) => { kv.delete(k); }, keys: async () => [...kv.keys()],
}));

const MD = `---\ntitle: T\n---\n\n# A\n\n## A1\n\n- a\n\n# B\n\n## B1 {img=1/2}\n\n![x](images/x.png)\n`;

async function fresh() {
  vi.resetModules();
  kv.clear();
  const mod = await import("../../src/store/deckStore");
  mod.useDeckStore.getState().setMarkdown(MD);
  return mod;
}

describe("deckStore: markdown as single source", () => {
  it("derives deck and slides from markdown", async () => {
    const { useDeckStore } = await fresh();
    const s = useDeckStore.getState();
    expect(s.deck.blocks).toHaveLength(4);
    expect(s.slides.map((x) => x.displayTitle)).toEqual(["T", "Agenda", "1. A", "1.1. A1", "2. B", "2.1. B1"]);
  });
  it("select sets gotoLine; selectByLine follows the cursor", async () => {
    const { useDeckStore } = await fresh();
    const st = useDeckStore.getState();
    const b1 = st.slides.find((x) => x.title === "B1")!;
    st.select(b1.id);
    expect(useDeckStore.getState().gotoLine).toBe(b1.sourceLine);
    useDeckStore.getState().clearGoto();
    expect(useDeckStore.getState().gotoLine).toBeNull();
    useDeckStore.getState().selectByLine(0);
    expect(useDeckStore.getState().selectedId).toBe("cover");
    useDeckStore.getState().selectByLine(7); // inside "## A1"
    expect(useDeckStore.getState().selectedId).toBe(st.slides.find((x) => x.title === "A1")!.id);
    useDeckStore.getState().selectByLine(7);
    expect(useDeckStore.getState().selectedId).toBe(st.slides.find((x) => x.title === "A1")!.id);
  });
  it("move rewrites markdown, renumbers, keeps the moved slide selected and bumps the editor version", async () => {
    const { useDeckStore } = await fresh();
    const st = useDeckStore.getState();
    const [secA, , secB] = st.deck.blocks;
    st.move(secB.id, secA.id, "before");
    const after = useDeckStore.getState();
    expect(after.slides.map((x) => x.displayTitle).slice(2)).toEqual(["1. B", "1.1. B1", "2. A", "2.1. A1"]);
    expect(after.markdown.indexOf("# B")).toBeLessThan(after.markdown.indexOf("# A"));
    expect(after.externalEditVersion).toBe(1);
    expect(after.slides.find((x) => x.id === after.selectedId)?.title).toBe("B");
    // no-op move leaves state untouched
    after.move("nope", secA.id, "after");
    expect(useDeckStore.getState().externalEditVersion).toBe(1);
  });
  it("setLayout writes and clears heading attributes", async () => {
    const { useDeckStore } = await fresh();
    const st = useDeckStore.getState();
    const a1 = st.deck.blocks[1];
    st.setLayout(a1.id, { kind: "image", width: 0.75, side: "left" });
    expect(useDeckStore.getState().markdown).toContain("## A1 {img=3/4 side=left}");
    useDeckStore.getState().setLayout(useDeckStore.getState().deck.blocks[1].id, { kind: "2col" });
    expect(useDeckStore.getState().markdown).toContain("## A1 {layout=2col}");
    useDeckStore.getState().setLayout(useDeckStore.getState().deck.blocks[1].id, null);
    expect(useDeckStore.getState().markdown).toContain("## A1\n");
    expect(useDeckStore.getState().markdown).not.toContain("## A1 {");
  });
  it("keeps the selection on the same block when a slide splits or merges", async () => {
    const { useDeckStore } = await fresh();
    const st = useDeckStore.getState();
    const a1 = st.deck.blocks[1];
    st.select(a1.id);
    // shrink the box by making it an image slide and enlarge the font: the slide splits, ids gain "#n"
    useDeckStore.getState().setLayout(a1.id, { kind: "image", width: 0.75, side: "left" });
    useDeckStore.getState().setAttr(a1.id, "size", "40");
    const many = Array.from({ length: 20 }, (_, i) => `- 項目${i}`).join("\n");
    useDeckStore.getState().setMarkdown(useDeckStore.getState().markdown.replace("- a\n", many + "\n"));
    const s1 = useDeckStore.getState();
    expect(s1.slides.filter((x) => x.blockId === a1.id).length).toBeGreaterThan(1);
    expect(s1.selectedId).toBe(`${a1.id}#1`);
    // and back
    useDeckStore.getState().setAttr(a1.id, "size", "8");
    expect(useDeckStore.getState().selectedId).toBe(a1.id);
  });
  it("tracks image dimensions without redundant updates", async () => {
    const { useDeckStore } = await fresh();
    useDeckStore.getState().setImageDims("images/x.png", 100, 50);
    const ref = useDeckStore.getState().imageDims;
    useDeckStore.getState().setImageDims("images/x.png", 100, 50);
    expect(useDeckStore.getState().imageDims).toBe(ref);
    expect(ref["images/x.png"]).toEqual({ w: 100, h: 50 });
  });
  it("uses master geometry for line capacity when the frontmatter names a master from the folder", async () => {
    const { useDeckStore } = await fresh();
    const { masterSource } = await import("../../src/master/masterSource");
    await masterSource.add(new File([readFileSync("examples/sample-master.pptx")], "sample.pptx"));
    await useDeckStore.getState().refreshMasters();
    expect(useDeckStore.getState().masters.map((m) => m.id)).toEqual(["dir:sample.pptx"]);
    expect(useDeckStore.getState().masterId).toBeNull(); // nothing chosen yet: no silent default
    useDeckStore.getState().setMaster("dir:sample.pptx");
    expect(useDeckStore.getState().markdown).toMatch(/^---\ntitle: T\nmaster: sample\.pptx\n---\n/); // the choice lives in the markdown
    expect(useDeckStore.getState().masterId).toBe("dir:sample.pptx");
    const long = `---\nmaster: sample.pptx\n---\n\n## L\n\n${Array.from({ length: 40 }, (_, i) => `- line ${i}`).join("\n")}\n`;
    useDeckStore.getState().setMarkdown(long);
    const parts = useDeckStore.getState().slides.filter((s) => s.title === "L");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].continuation).toEqual({ index: 1, total: parts.length });
    useDeckStore.getState().setMaster(null);
    expect(useDeckStore.getState().markdown).not.toContain("master:"); // nothing would apply anyway, so the key is simply dropped
    expect(useDeckStore.getState().masterId).toBeNull();
  });
});

describe("deckStore: start screen", () => {
  it("is not started until something is opened; viewSample shows the built-in sample without a workspace", async () => {
    vi.resetModules(); kv.clear();
    const { useDeckStore } = await import("../../src/store/deckStore");
    expect(useDeckStore.getState().started).toBe(false);
    useDeckStore.getState().viewSample();
    const st = useDeckStore.getState();
    expect(st.started).toBe(true);
    expect(st.workspace).toBeNull();
    expect(st.deck.meta.title).toBe("CI/CD パイプライン改善 進捗報告");
  });
});

describe("deckStore: workspace lifecycle (browser backend)", () => {
  let root: FakeDirHandle;
  beforeEach(() => { root = new FakeDirHandle("deck"); installFakePicker(root); vi.useFakeTimers(); });

  it("creates deck.md when missing, autosaves edits, exports deck.json", async () => {
    const { useDeckStore } = await fresh();
    await useDeckStore.getState().openWorkspace();
    expect(useDeckStore.getState().workspace?.name).toBe("deck");
    expect(useDeckStore.getState().workspace?.deckFile).toBe("deck.md");
    expect(useDeckStore.getState().started).toBe(true);
    expect(root.text("deck.md")).toBe(MD);
    expect(useDeckStore.getState().dirty).toBe(false);

    useDeckStore.getState().setMarkdown(MD + "\n## C\n");
    expect(useDeckStore.getState().dirty).toBe(true);
    expect(useDeckStore.getState().saveState).toBe("idle");
    await vi.advanceTimersByTimeAsync(1600);
    expect(root.text("deck.md")).toContain("## C");
    expect(useDeckStore.getState().dirty).toBe(false);
    expect(useDeckStore.getState().saveState).toBe("saved");

    expect(await useDeckStore.getState().exportDeckJson("{}")).toBe("written");
    expect(root.text("deck.json")).toBe("{}");
    const r = await useDeckStore.getState().runExport();
    expect(r.ok).toBe(false); // browser backend cannot spawn python
  });

  it("reads, saves and watches the workspace's own deck file", async () => {
    const files = new Map<string, string>([["plan.md", "---\ntitle: Plan\n---\n\n## P\n"]]);
    const backend = {
      kind: "browser" as const,
      readText: async (p: string) => files.has(p) ? { text: files.get(p)!, modified: 1 } : null,
      readBlob: async () => null, writeText: async (p: string, t: string) => { files.set(p, t); return 5; }, writeBlob: async () => 1,
      modified: async (p: string): Promise<number | null> => files.has(p) ? 1 : null, exists: async (p: string) => files.has(p), list: async () => [], remove: async () => undefined,
    };
    const { useDeckStore } = await fresh();
    useDeckStore.setState({ workspace: { name: "w", deckFile: "plan.md", backend: backend as never }, started: true });
    await useDeckStore.getState().loadFromDisk();
    expect(useDeckStore.getState().deck.meta.title).toBe("Plan");
    expect(files.get("AGENTS.md")).toContain("plan.md");
    expect(files.get("CLAUDE.md")).toBe("@AGENTS.md\n");
    useDeckStore.getState().setMarkdown("---\ntitle: Plan2\n---\n\n## P\n");
    await useDeckStore.getState().save(true);
    expect(files.get("plan.md")).toContain("Plan2");
    expect(files.has("deck.md")).toBe(false);
    files.set("plan.md", "---\ntitle: Outside\n---\n\n## P\n");
    backend.modified = async () => 99;
    useDeckStore.getState().onFileChanged("plan.md");
    await vi.advanceTimersByTimeAsync(10);
    expect(useDeckStore.getState().deck.meta.title).toBe("Outside");
  });

  it("a new file (no deck on disk) takes the scaffold as the document: editor, thumbnails and disk all agree", async () => {
    const files = new Map<string, string>();
    const backend = {
      kind: "browser" as const,
      readText: async (p: string) => files.has(p) ? { text: files.get(p)!, modified: 1 } : null,
      readBlob: async () => null, writeText: async (p: string, t: string) => { files.set(p, t); return 7; }, writeBlob: async () => 1,
      modified: async (p: string): Promise<number | null> => files.has(p) ? 1 : null, exists: async (p: string) => files.has(p), list: async () => [], remove: async () => undefined,
    };
    const { useDeckStore } = await fresh(); // the store holds the sample (MD) as if the app had just started
    const { newDeckTemplate } = await import("../../src/model/template");
    const scaffold = newDeckTemplate("q3-report.md");
    const version = useDeckStore.getState().externalEditVersion;
    useDeckStore.setState({ workspace: { name: "w", deckFile: "q3-report.md", backend: backend as never }, started: true });
    await useDeckStore.getState().loadFromDisk(scaffold);
    const s = useDeckStore.getState();
    expect(files.get("q3-report.md")).toBe(scaffold);                       // written to disk
    expect(s.markdown).toBe(scaffold);                                        // the editor's document, not the previous one
    expect(s.externalEditVersion).toBe(version + 1);                          // so the editor replaces its buffer
    expect(s.deck.meta.title).toBe("q3-report");
    expect(s.slides.map((x) => x.displayTitle)).toEqual(["q3-report", "Agenda", "1. 章タイトル", "1.1. スライドタイトル"]);
    expect(s.selectedId).toBe("cover");
    expect(s.dirty).toBe(false);
    expect(s.diskModified).toBe(7);
  });

  it("resolves the master: frontmatter, then the folder's master.pptx, then the configured default", async () => {
    vi.useRealTimers(); // JSZip needs real timers
    root.put("master.pptx", readFileSync("examples/sample-master.pptx"));
    const { useDeckStore } = await fresh();
    const { masterSource } = await import("../../src/master/masterSource");
    const { settings } = await import("../../src/settings/settings");
    await masterSource.add(new File([readFileSync("examples/sample-master.pptx")], "corp.pptx"));
    await useDeckStore.getState().refreshMasters();
    await useDeckStore.getState().openWorkspace();
    expect(useDeckStore.getState().masterId).toBe("ws:deck"); // the folder's master.pptx when the frontmatter is silent
    useDeckStore.getState().setMarkdown("---\nmaster: corp.pptx\n---\n\n## X\n");
    expect(useDeckStore.getState().masterId).toBe("dir:corp.pptx");
    useDeckStore.getState().setMarkdown("---\nmaster: missing.pptx\n---\n\n## X\n");
    expect(useDeckStore.getState().masterId).toBeNull();
    expect(useDeckStore.getState().masterMissing).toBe("missing.pptx");
    useDeckStore.getState().setMarkdown("---\nmaster: none\n---\n\n## X\n");
    expect(useDeckStore.getState().masterId).toBeNull();
    expect(useDeckStore.getState().masterMissing).toBeNull();
    // no frontmatter and no folder master: the configured default applies
    useDeckStore.setState({ workspace: null });
    settings.update((v) => { v.masters.default = "corp.pptx"; });
    useDeckStore.getState().setMarkdown("## X\n");
    expect(useDeckStore.getState().masterId).toBe("dir:corp.pptx");
    // export uses the resolved file: the folder's own master.pptx by relative name, a folder master by absolute path
    useDeckStore.setState({ workspace: { name: "w", path: "/w", deckFile: "deck.md", backend: { exists: async () => false, runExport: async (_j: string, m: string) => ({ code: 0, stdout: m, stderr: "" }) } as never } });
    useDeckStore.getState().setMarkdown("---\nmaster: corp.pptx\n---\n\n## X\n");
    expect((await useDeckStore.getState().runExport()).ok).toBe(false); // memory source has no folder on disk
    useDeckStore.getState().setMarkdown("---\nmaster: none\n---\n\n## X\n");
    expect((await useDeckStore.getState().runExport()).message).toContain("書き出しにはマスターが必要");
  });

  it("loads an existing deck.md and master.pptx from the folder", async () => {
    vi.useRealTimers(); // JSZip needs real timers
    root.put("deck.md", "---\ntitle: FromDisk\n---\n\n## X\n");
    root.put("master.pptx", readFileSync("examples/sample-master.pptx"));
    const { useDeckStore } = await fresh();
    await useDeckStore.getState().openWorkspace();
    const st = useDeckStore.getState();
    expect(st.deck.meta.title).toBe("FromDisk");
    expect(st.masterId).toBe("ws:deck");
    expect(st.masters[0].name).toBe("deck/master.pptx");
    expect(st.externalEditVersion).toBeGreaterThan(0);
  });

  it("viewer mode: external change reloads when clean, flags when dirty, and never autosaves over it", async () => {
    const { useDeckStore } = await fresh();
    await useDeckStore.getState().openWorkspace();
    // clean: reload
    root.put("deck.md", "---\ntitle: External\n---\n\n## Y\n");
    await useDeckStore.getState().pollDisk();
    expect(useDeckStore.getState().deck.meta.title).toBe("External");
    // dirty: flag, keep local edits
    useDeckStore.getState().setMarkdown("---\ntitle: Local\n---\n\n## Z\n");
    root.put("deck.md", "---\ntitle: External2\n---\n", Date.now() + 100000);
    await useDeckStore.getState().pollDisk();
    expect(useDeckStore.getState().externalChange).toBe(true);
    expect(useDeckStore.getState().deck.meta.title).toBe("Local");
    await vi.advanceTimersByTimeAsync(2000);            // autosave must not clobber
    expect(root.text("deck.md")).toContain("External2");
    await useDeckStore.getState().save(true);            // explicit overwrite wins
    expect(root.text("deck.md")).toContain("Local");
    expect(useDeckStore.getState().externalChange).toBe(false);
    // discard local: reload from disk
    root.put("deck.md", "---\ntitle: External3\n---\n", Date.now() + 200000);
    useDeckStore.getState().setMarkdown("edit");
    await useDeckStore.getState().pollDisk();
    await useDeckStore.getState().loadFromDisk();
    expect(useDeckStore.getState().deck.meta.title).toBe("External3");
    expect(useDeckStore.getState().dirty).toBe(false);
  });

  it("normalises pasted images through processImage when the browser can decode", async () => {
    vi.useRealTimers();
    const { useDeckStore } = await fresh();
    const mod = await import("../../src/model/imageProcess"); // same module instance the fresh store uses
    const spy = vi.spyOn(mod, "processImage").mockResolvedValue({ blob: new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }), type: "image/jpeg", changed: true, width: 2000, height: 1125 });
    await useDeckStore.getState().openWorkspace();
    useDeckStore.getState().setMarkdown("---\ntitle: T\nimageMaxPx: 1200\n---\n\n## A\n");
    const rel = await useDeckStore.getState().pasteImage(new Blob([new Uint8Array(10)], { type: "image/png" }), "shot");
    expect(spy).toHaveBeenCalledWith(expect.any(Blob), { maxPx: 1200 });
    expect(rel).toBe("images/shot.jpg");
    expect(useDeckStore.getState().imageDims[rel]).toEqual({ w: 2000, h: 1125 });
    expect(useDeckStore.getState().notice).toMatch(/2000×1125 \/ JPEG/);
    spy.mockRestore();
  });
  it("stores pasted images and resolves image URLs", async () => {
    const { useDeckStore } = await fresh();
    await expect(useDeckStore.getState().pasteImage(new Blob([]), "x")).rejects.toThrow();
    await useDeckStore.getState().openWorkspace();
    const rel = await useDeckStore.getState().pasteImage(new Blob([new Uint8Array([1])], { type: "image/png" }), "2.1 図");
    expect(rel).toBe("images/2-1-図.png");
    expect(useDeckStore.getState().imageUrls[rel]).toBe("blob:mock");
    useDeckStore.getState().resolveImage("images/nope.png");
    expect(useDeckStore.getState().imageUrls["images/nope.png"]).toBeNull(); // loading marker
    await vi.advanceTimersByTimeAsync(10);
    expect(useDeckStore.getState().imageUrls["images/nope.png"]).toBeNull(); // not found stays null
    useDeckStore.getState().resolveImage("https://x/y.png");
    expect("https://x/y.png" in useDeckStore.getState().imageUrls).toBe(false);
    useDeckStore.getState().onFileChanged(rel);
    expect(rel in useDeckStore.getState().imageUrls).toBe(false);
  });
  it("resolveImage settles as not found when the backend cannot read the file", async () => {
    const { useDeckStore } = await fresh();
    const backend = { readBlob: async () => { throw new Error("EACCES"); } };
    useDeckStore.setState({ workspace: { name: "w", path: "/w", deckFile: "deck.md", backend: backend as never } });
    await expect(useDeckStore.getState().resolveImage("images/x.png")).resolves.toBeUndefined();
    expect(useDeckStore.getState().imageUrls["images/x.png"]).toBeNull();
    await expect(useDeckStore.getState().resolveImage("images/x.png")).resolves.toBeUndefined(); // cached: no second read
  });

  it("restores the last workspace", async () => {
    const m = await fresh();
    await m.useDeckStore.getState().openWorkspace();
    vi.resetModules(); // new app session, same browser storage
    const m2 = await import("../../src/store/deckStore");
    await m2.useDeckStore.getState().restoreWorkspace();
    expect(m2.useDeckStore.getState().workspace?.name).toBe("deck");
  });
});
