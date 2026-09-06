import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideCanvas, BodyText, parseTableRow } from "../../src/components/SlideCanvas";
import { ThumbnailPane } from "../../src/components/ThumbnailPane";
import { PreviewPane } from "../../src/components/PreviewPane";
import { MasterDialog } from "../../src/components/MasterDialog";
import { App } from "../../src/components/App";
import { useDeckStore } from "../../src/store/deckStore";
import { parseMarkdown } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";
import { importMaster } from "../../src/master/importMaster";
import { FakeDirHandle, installFakePicker } from "../helpers/fakeFs";

// supportsWorkspace is decided when the workspace module loads, so the picker must exist before imports run.
vi.hoisted(() => { (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => null; });
vi.mock("@xterm/xterm", () => ({ Terminal: class { cols = 80; rows = 24; options = {}; loadAddon() {} open() {} focus() {} dispose() {} write() {} onData() { return { dispose() {} }; } } }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
const kv = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => kv.get(k), set: async (k: string, v: unknown) => { kv.set(k, v); },
  del: async (k: string) => { kv.delete(k); }, keys: async () => [...kv.keys()],
}));

const MD = `---
title: Deck
subtitle: Sub
agenda: per-section
---

# One

## Text slide

- a
- **b** and \`c\`

Para

| k | v |
|---|---|
| 1 | 2 |

## Img {img=1/2 side=left}

- t

![Fig](images/fig.png)

## Full {img=1/1}

![TODO Later]()

> note: hi

## Two {layout=2col}

- L

- R

# Two
`;

afterEach(() => cleanup());
beforeEach(() => { localStorage.setItem("mdslide:settings", JSON.stringify({ version: 1, help: { seen: true } })); useDeckStore.setState({ workspace: null, started: true, masters: [], masterId: null, imageUrls: {}, imageDims: {} }); useDeckStore.getState().setMarkdown(MD); });

describe("SlideCanvas", () => {
  const slides = () => renderDeck(parseMarkdown(MD));
  it("renders cover, agenda with current section, section and body variants", () => {
    const s = slides();
    const { container, rerender } = render(<SlideCanvas slide={s[0]} />);
    expect(container.textContent).toContain("Deck"); expect(container.textContent).toContain("Sub");
    rerender(<SlideCanvas slide={s[1]} />);
    expect(container.textContent).toContain("1. One"); expect(container.textContent).toContain("2. Two");
    const perSection = s.find((x) => x.id.startsWith("agenda:"))!;
    rerender(<SlideCanvas slide={perSection} />);
    expect(container.querySelector(".region")?.textContent).toContain("Agenda");
    rerender(<SlideCanvas slide={s.find((x) => x.title === "Text slide")!} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("b");
    expect(container.querySelector("code")?.textContent).toBe("c");
    rerender(<SlideCanvas slide={s.find((x) => x.title === "Two")!} />);
    expect(container.querySelectorAll(".region").length).toBe(3); // title + 2 columns
  });
  it("shows image placeholder, missing and loaded states with aspect from dims", () => {
    const s = slides();
    const { container, rerender } = render(<SlideCanvas slide={s.find((x) => x.title === "Full")!} />);
    expect(container.textContent).toContain("未挿入: Later");
    useDeckStore.setState({ workspace: { name: "w", deckFile: "deck.md", backend: {} as never }, imageUrls: { "images/fig.png": null } });
    rerender(<SlideCanvas slide={s.find((x) => x.title === "Img")!} />);
    expect(container.textContent).toContain("見つかりません");
    useDeckStore.setState({ imageUrls: { "images/fig.png": "blob:x" } });
    rerender(<SlideCanvas slide={s.find((x) => x.title === "Img")!} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:x");
    Object.defineProperty(img, "naturalWidth", { value: 300 }); Object.defineProperty(img, "naturalHeight", { value: 600 });
    fireEvent.load(img);
    expect(useDeckStore.getState().imageDims["images/fig.png"]).toEqual({ w: 300, h: 600 });
    fireEvent.error(img);
    expect(container.textContent).toContain("見つかりません");
  });
  it("warns when a full-width image leaves no room for text", () => {
    const md = `## F {img=1/1}\n\n- text\n\n![a](images/a.png)\n`;
    useDeckStore.setState({ imageDims: { "images/a.png": { w: 100, h: 100 } } });
    const s = renderDeck(parseMarkdown(md))[1];
    const { container } = render(<SlideCanvas slide={s} />);
    expect(container.textContent).toContain("本文の置き場がありません");
  });
  it("uses master geometry when available", async () => {
    const m = await importMaster(new Blob([readFileSync("examples/sample-master.pptx")]), "s");
    const s = slides();
    const { container } = render(<SlideCanvas slide={s.find((x) => x.title === "Text slide")!} master={m} />);
    const title = container.querySelector(".region") as HTMLElement;
    expect(title.style.left).not.toBe("5%"); // came from the master, not the preset
  });
  it("BodyText and parseTableRow handle edge cases", () => {
    expect(parseTableRow("| a | b |")).toEqual(["a", "b"]);
    expect(parseTableRow("plain")).toBeNull();
    expect(parseTableRow("|")).toBeNull();
    const { container } = render(<BodyText lines={["- x", "  - nested", "", "p"]} />);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("p")?.textContent).toBe("p");
  });
});

describe("ThumbnailPane", () => {
  it("selects on click and reorders on drag/drop", () => {
    render(<ThumbnailPane />);
    const items = document.querySelectorAll(".nav-item");
    fireEvent.click(items[3]);
    expect(useDeckStore.getState().selectedId).toBe(useDeckStore.getState().slides[3].id);
    // drag "Text slide" (index 3) below "Img" (index 4)
    const dt = { effectAllowed: "" };
    fireEvent.dragStart(items[3].parentElement!, { dataTransfer: dt });
    const target = items[4].parentElement!;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100 } as DOMRect);
    fireEvent.dragOver(target, { clientY: 80, dataTransfer: dt });
    fireEvent.drop(target, { dataTransfer: dt });
    const titles = useDeckStore.getState().slides.map((s) => s.title);
    expect(titles.indexOf("Img")).toBeLessThan(titles.indexOf("Text slide"));
    // cover/agenda are not draggable
    const ev = fireEvent.dragStart(document.querySelectorAll(".nav-item")[0].parentElement!, { dataTransfer: dt });
    expect(ev).toBe(false);
  });
});

describe("PreviewPane", () => {
  it("switches layouts through the segmented controls", async () => {
    const user = userEvent.setup();
    useDeckStore.getState().select(useDeckStore.getState().slides.find((s) => s.title === "Text slide")!.id);
    render(<PreviewPane />);
    await user.click(screen.getByRole("button", { name: "画像" }));
    expect(useDeckStore.getState().markdown).toContain("## Text slide {img=1/2 side=right}");
    await user.click(screen.getByRole("button", { name: "3/4" }));
    await user.click(screen.getByRole("button", { name: "左" }));
    expect(useDeckStore.getState().markdown).toContain("## Text slide {img=3/4 side=left}");
    await user.click(screen.getByRole("button", { name: "2カラム" }));
    expect(useDeckStore.getState().markdown).toContain("## Text slide {layout=2col}");
    await user.click(screen.getByRole("button", { name: "既定に戻す" }));
    expect(useDeckStore.getState().markdown).toContain("## Text slide\n");
    expect(screen.getByText(/既定レイアウトでプレビュー中/)).toBeInTheDocument();
    expect(screen.getByText(/^\d+ \/ \d+$/)).toBeInTheDocument();
  });
  it("shows notes and continuation info", () => {
    useDeckStore.getState().select(useDeckStore.getState().slides.find((s) => s.title === "Full")!.id);
    render(<PreviewPane />);
    expect(screen.getByText(/ノート · hi/)).toBeInTheDocument();
  });
});

describe("MasterDialog", () => {
  it("imports a pptx, selects it, lists roles, removes it", async () => {
    const onClose = vi.fn();
    render(<MasterDialog onClose={onClose} />);
    expect(screen.getByText(/まだ取り込んだマスターはありません/)).toBeInTheDocument();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([readFileSync("examples/sample-master.pptx")], "corp.pptx");
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByText("corp.pptx")).toBeInTheDocument());
    expect(useDeckStore.getState().masterId).toBe("dir:corp.pptx");
    expect(useDeckStore.getState().markdown).toContain("master: corp.pptx"); // the choice is written into the frontmatter
    expect(screen.getAllByText(/Body-Text/).length).toBeGreaterThan(0);
    expect(screen.getByText(/未使用/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("削除"));
    await waitFor(() => expect(useDeckStore.getState().masters).toHaveLength(0));
    expect(useDeckStore.getState().masterId).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("reports invalid files", async () => {
    render(<MasterDialog onClose={() => undefined} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await userEvent.upload(input, new File(["nope"], "x.pptx"));
    await waitFor(() => expect(screen.getByText(/pptx\/potx|zip|Corrupted|End of data/i)).toBeInTheDocument());
  });
});

describe("App", () => {
  it("renders banners, opens the master sheet, and exports deck.json into the workspace", async () => {
    const root = new FakeDirHandle("deck"); installFakePicker(root);
    render(<App />);
    expect(await screen.findByText(/スライドマスターが未設定/)).toBeInTheDocument();
    await screen.findByRole("button", { name: "フォルダを開く" });
    await userEvent.click(screen.getByRole("button", { name: "フォルダを開く" }));
    await screen.findByRole("button", { name: "deck/deck.md" });
    await userEvent.click(screen.getByRole("button", { name: "書き出す" }));
    await waitFor(() => expect(root.text("deck.json")).toContain('"version": 2'));
    expect(await screen.findByText(/deck.json を書き出しました/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await userEvent.click(screen.getByRole("button", { name: "マスター" }));
    expect(screen.getByText("スライドマスター")).toBeInTheDocument();
  });
  it("shows the external-change banner and resolves it", async () => {
    kv.clear();
    const root = new FakeDirHandle("deck"); installFakePicker(root);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "フォルダを開く" }));
    await screen.findByRole("button", { name: "deck/deck.md" });
    useDeckStore.getState().setMarkdown("# local\n");
    root.put("deck.md", "# remote\n", Date.now() + 100000);
    await useDeckStore.getState().pollDisk();
    expect(await screen.findByText(/フォルダ側で変更されました/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "こちらで上書き" }));
    await waitFor(() => expect(root.text("deck.md")).toBe("# local\n"));
  });
});

describe("references for Claude Code", () => {
  it("shows slide and image refs, copies on click, pastes into the terminal, ⌘⇧C, right-click thumbnail", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => { written.push(t); } }, configurable: true });
    const { useTerminalStore } = await import("../../src/console/terminalStore");
    const termWrites: string[] = [];
    useTerminalStore.setState({ ptyId: 1, bridge: { write: async (_id: number, d: string) => { termWrites.push(d); } } as never });
    useDeckStore.getState().select(useDeckStore.getState().slides.find((s) => s.title === "Img")!.id);
    render(<PreviewPane />);
    const line = useDeckStore.getState().slides.find((s) => s.title === "Img")!.sourceLine! + 1;
    await userEvent.click(screen.getByText(`deck.md:${line}`));
    expect(written).toEqual([`deck.md:${line}`]);
    expect(screen.getByText("コピーしました")).toBeInTheDocument();
    await userEvent.click(screen.getByText("images/fig.png"));
    expect(written.at(-1)).toBe("images/fig.png");
    await userEvent.click(screen.getAllByRole("button", { name: "端末へ" })[1]);
    expect(termWrites).toEqual(["images/fig.png "]);
    fireEvent.keyDown(window, { key: "c", metaKey: true, shiftKey: true });
    await waitFor(() => expect(written.at(-1)).toBe(`deck.md:${line}`));
    cleanup();
    render(<ThumbnailPane />);
    fireEvent.contextMenu(document.querySelectorAll(".nav-item")[2].parentElement!);
    await waitFor(() => expect(written.at(-1)).toBe("deck.md:7")); // "# One" (frontmatter is 5 lines + blank)
    useTerminalStore.setState({ ptyId: null, bridge: null });
  });
});

describe("font size stepper", () => {
  it("writes {size=N} to the heading, shows the fit estimate, and clears back to default", async () => {
    useDeckStore.getState().select(useDeckStore.getState().slides.find((s) => s.title === "Text slide")!.id);
    render(<PreviewPane />);
    expect(screen.getByText("18pt (既定)")).toBeInTheDocument();
    expect(screen.getByText(/推定 \d+ \/ \d+ 行/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "大きく" }));
    expect(useDeckStore.getState().markdown).toContain("## Text slide {size=20}");
    expect(screen.getByText("20pt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "小さく" }));
    await userEvent.click(screen.getByRole("button", { name: "小さく" }));
    expect(useDeckStore.getState().markdown).toContain("## Text slide {size=16}");
    await userEvent.click(screen.getByRole("button", { name: "既定の大きさ" }));
    expect(useDeckStore.getState().markdown).toContain("## Text slide\n");
  });
});
