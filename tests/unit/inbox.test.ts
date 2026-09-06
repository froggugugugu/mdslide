import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROMPTS, buildPrompt } from "../../src/console/prompts";
import { noteFileName, useInboxStore } from "../../src/console/inboxStore";
import { restoreLatestSnapshot, snapshotDeck } from "../../src/workspace/history";

function memBackend() {
  const files = new Map<string, string>();
  return {
    files,
    backend: {
      kind: "browser" as const,
      readText: async (p: string) => files.has(p) ? { text: files.get(p)!, modified: 1 } : null,
      readBlob: async () => null,
      writeText: async (p: string, t: string) => { files.set(p, t); return Date.now(); },
      writeBlob: async (p: string, b: Blob) => { files.set(p, `<blob ${b.size}>`); return 1; },
      modified: async (p: string) => files.has(p) ? 1 : null,
      exists: async (p: string) => files.has(p),
      list: async (dir: string) => [...files.keys()].filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)).filter((k) => !k.includes("/")),
      remove: async (p: string) => { files.delete(p); },
    },
  };
}

describe("prompt templates", () => {
  it("has the five actions in order, each referencing the notes folder or deck.md", () => {
    expect(PROMPTS.map((p) => p.id)).toEqual(["format", "figures", "restyle", "summarize", "outline"]);
    for (const p of PROMPTS) expect(p.text).toMatch(/notes\/|deck\.md/);
    expect(PROMPTS.find((p) => p.id === "figures")!.text).toContain("theme.json");
    expect(PROMPTS.find((p) => p.id === "figures")!.text).toContain("images/");
    expect(PROMPTS.find((p) => p.id === "figures")!.text).toContain("PNG");
  });
  it("attaches note references and the selected slide reference", () => {
    const t = buildPrompt("format", ["notes/a.md", "notes/b.txt"], "deck.md:17");
    expect(t).toContain("@notes/a.md");
    expect(t).toContain("@notes/b.txt");
    expect(t).toContain("deck.md:17");
    expect(t.includes("\n")).toBe(false); // one line: the terminal sends it as a single message
  });
  it("names the workspace's deck file in the instruction", () => {
    const t = buildPrompt("format", ["notes/a.md"], "plan.md:3", "plan.md");
    expect(t).toContain("plan.md をスライド資料として整形");
    expect(t).not.toContain("deck.md");
  });
});

describe("inbox store", () => {
  beforeEach(() => useInboxStore.getState().reset());
  it("names notes by timestamp and refreshes the list from notes/", async () => {
    expect(noteFileName(new Date(2026, 8, 6, 14, 5), "md")).toBe("notes/2026-09-06-1405.md");
    const { backend, files } = memBackend();
    files.set("notes/old.md", "x");
    await useInboxStore.getState().refresh(backend);
    expect(useInboxStore.getState().notes).toEqual(["notes/old.md"]);
  });
  it("saves typed text with a debounce into one note per session, and drops files", async () => {
    vi.useFakeTimers();
    const { backend, files } = memBackend();
    const s = useInboxStore.getState();
    s.setDraft("こんにちは");
    s.setDraft("こんにちは、これは");
    await s.flush(backend);
    const name = useInboxStore.getState().draftFile!;
    expect(name).toMatch(/^notes\/\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
    expect(files.get(name)).toBe("こんにちは、これは");
    s.setDraft("こんにちは、これは続き");
    await vi.advanceTimersByTimeAsync(1600);
    expect(files.get(name)).toBe("こんにちは、これは続き");
    await s.dropFiles(backend, [new File(["a"], "memo.txt"), new File([new Uint8Array(3)], "shot.png", { type: "image/png" })]);
    expect(files.get("notes/memo.txt")).toBe("<blob 1>");
    expect(files.get("notes/shot.png")).toBe("<blob 3>");
    expect(useInboxStore.getState().notes).toEqual(expect.arrayContaining(["notes/memo.txt", "notes/shot.png", name]));
    await s.remove(backend, "notes/memo.txt");
    expect(files.has("notes/memo.txt")).toBe(false);
    vi.useRealTimers();
  });
  it("dropping a duplicate name adds a suffix", async () => {
    const { backend, files } = memBackend();
    files.set("notes/memo.txt", "old");
    await useInboxStore.getState().dropFiles(backend, [new File(["a"], "memo.txt")]);
    expect(files.has("notes/memo-2.txt")).toBe(true);
  });
});

describe("deck history", () => {
  it("snapshots deck.md before an AI run and restores the latest one", async () => {
    const { backend, files } = memBackend();
    files.set("deck.md", "v1");
    const a = await snapshotDeck(backend, new Date(2026, 8, 6, 10, 0, 0));
    expect(a).toBe(".mdslide/history/2026-09-06-100000.md");
    expect(files.get(a!)).toBe("v1");
    files.set("deck.md", "v2");
    await snapshotDeck(backend, new Date(2026, 8, 6, 10, 5, 0));
    files.set("deck.md", "v3 (ai)");
    const restored = await restoreLatestSnapshot(backend);
    expect(restored).toBe(".mdslide/history/2026-09-06-100500.md");
    expect(files.get("deck.md")).toBe("v2");
    expect(files.get(".mdslide/history/2026-09-06-100500.md")).toBeUndefined(); // consumed
    expect([...files.keys()].some((k) => k.startsWith(".mdslide/history/") && files.get(k) === "v3 (ai)")).toBe(true); // the replaced version is kept
    await restoreLatestSnapshot(backend);
    expect(files.get("deck.md")).toBe("v3 (ai)"); // undo of the undo
    expect(await restoreLatestSnapshot({ ...backend, list: async () => [] })).toBeNull();
  });
  it("works for a deck file that is not deck.md", async () => {
    const { backend, files } = memBackend();
    files.set("plan.md", "p1");
    const a = await snapshotDeck(backend, new Date(2026, 8, 6, 11, 0, 0), "plan.md");
    expect(files.get(a!)).toBe("p1");
    files.set("plan.md", "p2 (ai)");
    await restoreLatestSnapshot(backend, new Date(2026, 8, 6, 11, 1, 0), "plan.md");
    expect(files.get("plan.md")).toBe("p1");
    expect(files.has("deck.md")).toBe(false);
  });
});
