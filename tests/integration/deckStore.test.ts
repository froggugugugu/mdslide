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
  it("uses master geometry for line capacity", async () => {
    const { useDeckStore } = await fresh();
    const { importMaster } = await import("../../src/master/importMaster");
    const { saveMaster } = await import("../../src/master/masterStore");
    const profile = await importMaster(new Blob([readFileSync("examples/sample-master.pptx")]), "sample");
    await saveMaster(profile, new Blob([]));
    await useDeckStore.getState().refreshMasters();
    expect(useDeckStore.getState().masterId).toBe(profile.id);
    const long = `## L\n\n${Array.from({ length: 40 }, (_, i) => `- line ${i}`).join("\n")}\n`;
    useDeckStore.getState().setMarkdown(long);
    const parts = useDeckStore.getState().slides.filter((s) => s.title === "L");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].continuation).toEqual({ index: 1, total: parts.length });
    useDeckStore.getState().setMaster(null);
    expect(useDeckStore.getState().masterId).toBeNull();
  });
});

describe("deckStore: workspace lifecycle (browser backend)", () => {
  let root: FakeDirHandle;
  beforeEach(() => { root = new FakeDirHandle("deck"); installFakePicker(root); vi.useFakeTimers(); });

  it("creates deck.md when missing, autosaves edits, exports deck.json", async () => {
    const { useDeckStore } = await fresh();
    await useDeckStore.getState().openWorkspace();
    expect(useDeckStore.getState().workspace?.name).toBe("deck");
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
    useDeckStore.setState({ workspace: { name: "w", path: "/w", backend: backend as never } });
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
