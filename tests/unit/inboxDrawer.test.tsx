import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InboxDrawer } from "../../src/components/InboxDrawer";
import { useInboxStore } from "../../src/console/inboxStore";
import { useTerminalStore } from "../../src/console/terminalStore";
import { useDeckStore } from "../../src/store/deckStore";

function memFs() {
  const files = new Map<string, string>();
  const fs = {
    kind: "browser" as const,
    readText: async (p: string) => files.has(p) ? { text: files.get(p)!, modified: 1 } : null,
    readBlob: async () => null,
    writeText: async (p: string, t: string) => { files.set(p, t); return Date.now(); },
    writeBlob: async (p: string, b: Blob) => { files.set(p, `<blob ${b.size}>`); return 1; },
    modified: async () => 1, exists: async (p: string) => files.has(p),
    list: async (dir: string) => [...files.keys()].filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)).filter((k) => !k.includes("/")),
    remove: async (p: string) => { files.delete(p); },
  };
  return { files, fs };
}

afterEach(() => cleanup());
beforeEach(() => { useInboxStore.getState().reset(); useInboxStore.setState({ open: true }); useTerminalStore.getState().reset(); });

describe("InboxDrawer", () => {
  it("saves the draft to notes/, lists and removes notes, and sends prompts with references after a snapshot", async () => {
    const { files, fs } = memFs();
    files.set("deck.md", "# before\n");
    files.set("notes/old.txt", "x");
    const written: string[] = [];
    useTerminalStore.setState({ ptyId: 1, bridge: { write: async (_id: number, d: string) => { written.push(d); } } as never });
    useDeckStore.setState({ workspace: { name: "w", path: "/w", deckFile: "deck.md", backend: fs as never }, notice: null });
    useDeckStore.getState().setMarkdown("# before\n\n## S\n\n- a\n");
    render(<InboxDrawer />);
    expect(await screen.findByText("old.txt")).toBeInTheDocument();
    const box = screen.getByRole("textbox", { name: "メモ" });
    await userEvent.type(box, "口語でつらつら");
    fireEvent.blur(box);
    await waitFor(() => expect([...files.keys()].some((k) => /^notes\/\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(k))).toBe(true));
    await userEvent.click(screen.getByRole("checkbox", { name: "notes/old.txt を渡す" }));
    await userEvent.click(screen.getByRole("button", { name: "整形して deck.md に" }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain("@notes/old.txt");
    expect(written[0]).not.toMatch(/@notes\/\d{4}/);          // only the checked note
    expect(written[0].endsWith("\r")).toBe(true);
    expect([...files.keys()].some((k) => k.startsWith(".mdslide/history/"))).toBe(true); // snapshot before the AI run
    await userEvent.click(screen.getByRole("button", { name: "notes/old.txt を削除" }));
    await waitFor(() => expect(files.has("notes/old.txt")).toBe(false));
  });
  it("refuses to send when no tool is running, and undoes to the previous deck", async () => {
    const { files, fs } = memFs();
    files.set("deck.md", "v-ai\n");
    files.set(".mdslide/history/2026-09-06-100000.md", "v-before\n");
    useDeckStore.setState({ workspace: { name: "w", path: "/w", deckFile: "deck.md", backend: fs as never }, notice: null, masters: [], masterId: null });
    render(<InboxDrawer />);
    await userEvent.click(screen.getByRole("button", { name: "要約" }));
    expect(useDeckStore.getState().notice).toMatch(/起動してから/);
    await userEvent.click(screen.getByRole("button", { name: "前の版に戻す" }));
    await waitFor(() => expect(files.get("deck.md")).toBe("v-before\n"));
    expect(useDeckStore.getState().notice).toMatch(/戻しました/);
  });
  it("accepts dropped files and text", async () => {
    const { files, fs } = memFs();
    useDeckStore.setState({ workspace: { name: "w", path: "/w", deckFile: "deck.md", backend: fs as never } });
    render(<InboxDrawer />);
    const drawer = screen.getByTestId("inbox");
    fireEvent.drop(drawer, { dataTransfer: { files: [new File(["m"], "memo.txt")], getData: () => "" } });
    await waitFor(() => expect(files.has("notes/memo.txt")).toBe(true));
    fireEvent.drop(drawer, { dataTransfer: { files: [], getData: () => "dropped text" } });
    expect(useInboxStore.getState().draft).toBe("dropped text");
  });
  it("opens a note in the editor by its name and saves edits back to that file", async () => {
    const { files, fs } = memFs();
    files.set("notes/old.md", "古いメモ");
    files.set("notes/scan.pdf", "<blob>");
    useDeckStore.setState({ workspace: { name: "w", path: "/w", deckFile: "deck.md", backend: fs as never } });
    render(<InboxDrawer />);
    await userEvent.click(await screen.findByRole("button", { name: "notes/old.md を開く" }));
    const box = screen.getByRole("textbox", { name: "メモ" });
    await waitFor(() => expect(box).toHaveValue("古いメモ"));
    expect(screen.getAllByText("old.md")).toHaveLength(2); // the list entry and the bar, which names the file being edited
    await userEvent.type(box, "、追記");
    fireEvent.blur(box);
    await waitFor(() => expect(files.get("notes/old.md")).toBe("古いメモ、追記"));
    expect(screen.queryByRole("button", { name: "notes/scan.pdf を開く" })).toBeNull(); // not text: listed, not editable
    expect(screen.getByText("scan.pdf")).toBeInTheDocument();
  });
  it("closes with the button and ⌘I", async () => {
    useDeckStore.setState({ workspace: null });
    render(<InboxDrawer />);
    await userEvent.click(screen.getByRole("button", { name: "下書きを閉じる" }));
    expect(useInboxStore.getState().open).toBe(false);
    fireEvent.keyDown(window, { key: "i", metaKey: true });
    expect(useInboxStore.getState().open).toBe(true);
  });
});
