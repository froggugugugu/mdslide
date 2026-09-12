import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideCanvas, BodyText, parseTableRow } from "../../src/components/SlideCanvas";
import { ThumbnailPane } from "../../src/components/ThumbnailPane";
import { PreviewPane } from "../../src/components/PreviewPane";
import { SettingsSheet } from "../../src/components/SettingsSheet";
import { App } from "../../src/components/App";
import { settings } from "../../src/settings/settings";
import { useDeckStore } from "../../src/store/deckStore";
import { parseMarkdown } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";
import { findLayout, importMaster } from "../../src/master/importMaster";
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
  it("draws the master's decorations, backgrounds, placeholder colours, theme fonts and footers", async () => {
    const { decoratedMaster } = await import("../helpers/decoratedMaster");
    const m = await importMaster(await decoratedMaster(), "deco");
    const s = renderDeck(parseMarkdown(MD));
    // a body slide: master bar (accent1), logo, text box, and the slide number footer
    const bodySlide = s.find((x) => x.title === "Text slide")!;
    const { container, rerender } = render(<SlideCanvas slide={bodySlide} master={m} />);
    const canvas = container.querySelector(".slide-canvas") as HTMLElement;
    expect(canvas.style.background || canvas.style.backgroundColor).toContain("rgb(255, 255, 255)"); // master background: bg1
    const decor = container.querySelectorAll(".decor");
    expect(decor.length).toBeGreaterThanOrEqual(4);
    expect((container.querySelector(".decor.image img") as HTMLImageElement).src).toMatch(/^data:image\/png/);
    expect((container.querySelector(".decor.shape") as HTMLElement).style.backgroundColor).toContain("rgb(");
    expect(container.querySelector(".decor.text")?.textContent).toBe("CONFIDENTIAL & INTERNAL");
    expect(container.querySelector(".footer-ph")?.textContent).toBe(String(s.indexOf(bodySlide) + 1)); // slide number field
    // theme fonts on the title
    const title = container.querySelector(".region") as HTMLElement;
    expect(title.style.fontFamily).toContain(m.theme!.fonts.major);
    // the cover: layout background and the white title from the placeholder style
    rerender(<SlideCanvas slide={s[0]} master={m} />);
    expect((container.querySelector(".slide-canvas") as HTMLElement).style.background || (container.querySelector(".slide-canvas") as HTMLElement).style.backgroundColor).toContain("rgb(29, 53, 87)");
    expect((container.querySelector(".region") as HTMLElement).style.color).toBe("rgb(255, 255, 255)");
    // a section: showMasterSp="0" hides the master's decorations
    rerender(<SlideCanvas slide={s.find((x) => x.kind === "section")!} master={m} />);
    expect(container.querySelectorAll(".decor")).toHaveLength(0);
  });
  it("stops text bodies above the master's footer and lays them out with its insets and paragraph spacing", async () => {
    const { decoratedMaster } = await import("../helpers/decoratedMaster");
    const { contentBand } = await import("../../src/model/boxes");
    const m = await importMaster(await decoratedMaster(), "deco");
    const s = renderDeck(parseMarkdown(MD));
    const { container } = render(<SlideCanvas slide={s.find((x) => x.title === "Text slide")!} master={m} />);
    const body = container.querySelectorAll(".region")[1] as HTMLElement;
    const r = findLayout(m, "body", "text")!.placeholders.find((p) => p.type === "body" || p.type === "obj")!.rect!;
    const { w, h } = m.slideSize;
    expect(parseFloat(body.style.height)).toBeCloseTo(((contentBand(m)!.bottom * w - r.y) / h) * 100, 3);
    expect(parseFloat(body.style.height)).toBeLessThan((r.h / h) * 100);   // cut off above the logo in the footer
    expect(body.classList.contains("metrics")).toBe(true);
    expect(body.style.getPropertyValue("--para-gap")).toMatch(/px$/);
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
  it("grabbing a chapter dims its whole span and the drag image says how many slides travel", () => {
    useDeckStore.getState().setMarkdown("# A\n\n## a1\n\n- x\n\n## a2\n\n- y\n\n# B\n\n## b1\n\n- z\n");
    render(<ThumbnailPane />);
    const tiles = [...document.querySelectorAll("[role=option]")] as HTMLElement[];
    const byLabel = (t: string) => tiles.find((el) => el.querySelector(".label")?.textContent?.endsWith(t))!;
    const dt = { effectAllowed: "", setDragImage: vi.fn() };
    fireEvent.dragStart(byLabel("A"), { dataTransfer: dt });
    expect([...document.querySelectorAll(".nav-item.dragging .label")].map((l) => l.textContent)).toEqual(["1. A", "1.1. a1", "1.2. a2"]);
    expect(byLabel("B").querySelector(".nav-item.dragging")).toBeNull();
    const ghost = document.querySelector(".drag-ghost")!;
    expect(ghost.textContent).toBe("1. A ほか 2 枚");
    expect(dt.setDragImage).toHaveBeenCalledWith(ghost, 16, 16);
    fireEvent.dragEnd(byLabel("A"));
    expect(document.querySelector(".drag-ghost")).toBeNull(); // cleaned up
    expect(document.querySelectorAll(".nav-item.dragging")).toHaveLength(0);
    // a lone body: nothing else travels, so no count
    fireEvent.dragStart(byLabel("b1"), { dataTransfer: dt });
    expect(document.querySelector(".drag-ghost")!.textContent).toBe("2.1. b1");
    fireEvent.dragEnd(byLabel("b1"));
  });
  it("a chapter dropped inside another chapter lands after it, so that chapter keeps its own slides", () => {
    useDeckStore.getState().setMarkdown("# A\n\n## a1\n\n- x\n\n## a2\n\n- y\n\n# B\n\n## b1\n\n- z\n\n# C\n\n## c1\n\n- w\n");
    render(<ThumbnailPane />);
    const tiles = [...document.querySelectorAll("[role=option]")] as HTMLElement[];
    const byLabel = (t: string) => tiles.find((el) => el.querySelector(".label")?.textContent?.endsWith(t))!;
    const dt = { effectAllowed: "" };
    fireEvent.dragStart(byLabel("C"), { dataTransfer: dt });
    const a1 = byLabel("a1");
    vi.spyOn(a1, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100 } as DOMRect);
    fireEvent.dragOver(a1, { clientY: 20, dataTransfer: dt }); // upper half of a1, in the middle of chapter A
    expect(a1.querySelector(".drop-line")).toBeNull();                           // the line is not drawn where the drop is not
    expect(byLabel("a2").querySelector(".drop-line")).not.toBeNull();            // but under A's last slide: "after A"
    fireEvent.drop(a1, { dataTransfer: dt });
    expect(useDeckStore.getState().deck.blocks.map((b) => b.title)).toEqual(["A", "a1", "a2", "C", "c1", "B", "b1"]); // B still owns b1
  });
  it("every part of an auto-split slide is a drag handle, and dragging one moves the whole block", () => {
    const long = `# One\n\n## Long\n\n${Array.from({ length: 30 }, (_, i) => `- line ${i}`).join("\n")}\n\n---\n\n- tail\n\n## Next\n\n- n\n`;
    useDeckStore.getState().setMarkdown(long);
    render(<ThumbnailPane />);
    const tiles = [...document.querySelectorAll("[role=option]")] as HTMLElement[];
    const byLabel = (t: string) => tiles.find((el) => el.querySelector(".label")?.textContent?.includes(t))!;
    const part2 = byLabel("(2/");
    expect(part2.getAttribute("draggable")).toBe("true"); // not only "(1/N)"
    const dt = { effectAllowed: "" };
    fireEvent.dragStart(part2, { dataTransfer: dt });
    expect(document.querySelectorAll(".nav-item.dragging").length).toBeGreaterThan(1); // the whole block is shown as moving
    const next = byLabel("Next");
    vi.spyOn(next, "getBoundingClientRect").mockReturnValue({ top: 0, height: 100 } as DOMRect);
    fireEvent.dragOver(next, { clientY: 80, dataTransfer: dt }); // below "Next"
    fireEvent.drop(next, { dataTransfer: dt });
    expect(useDeckStore.getState().deck.blocks.map((b) => b.title)).toEqual(["One", "Next", "Long"]);
  });
  it("moves the selection with ↑↓ / J K and reorders with ⌥↑↓ while the list has focus", () => {
    render(<ThumbnailPane />);
    const list = screen.getByRole("listbox", { name: "スライド一覧" });
    const at = (i: number) => useDeckStore.getState().slides[i].id;
    fireEvent.click(document.querySelectorAll(".nav-item")[3]); // Text slide
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(useDeckStore.getState().selectedId).toBe(at(4)); // Img
    fireEvent.keyDown(list, { key: "k" });
    expect(useDeckStore.getState().selectedId).toBe(at(3));
    fireEvent.keyDown(list, { key: "ArrowDown", altKey: true }); // move "Text slide" below "Img"
    const titles = useDeckStore.getState().slides.map((s) => s.title);
    expect(titles.indexOf("Img")).toBeLessThan(titles.indexOf("Text slide"));
    expect(document.querySelector("[role=option][aria-selected=true] .label")?.textContent).toContain("Text slide");
    fireEvent.keyDown(list, { key: "x" }); // unrelated keys are ignored
    expect(useDeckStore.getState().slides.map((s) => s.title)).toEqual(titles);
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

describe("Settings: master tab", () => {
  it("imports a pptx into the folder, makes the first one the default, lists roles, removes it", async () => {
    const onClose = vi.fn();
    settings.update((v) => { v.masters.default = null; });
    render(<SettingsSheet tab="master" onTab={() => undefined} onClose={onClose} />);
    expect(screen.getByText(/まだ取り込んだマスターはありません/)).toBeInTheDocument();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([readFileSync("examples/sample-master.pptx")], "corp.pptx");
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByText("corp.pptx")).toBeInTheDocument());
    expect(settings.get().masters.default).toBe("corp.pptx");          // the first master becomes the default
    expect(useDeckStore.getState().masterId).toBe("dir:corp.pptx");     // a deck that names none resolves to it
    expect(useDeckStore.getState().markdown).not.toContain("master:");  // without its Markdown being touched
    expect(await screen.findByText("既定")).toBeInTheDocument();          // the card re-renders when the settings change
    expect(screen.getAllByText(/Body-Text/).length).toBeGreaterThan(0);
    expect(screen.getByText(/未使用/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("削除"));
    await waitFor(() => expect(useDeckStore.getState().masters).toHaveLength(0));
    expect(useDeckStore.getState().masterId).toBeNull();
    expect(settings.get().masters.default).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("drops the bundled sample master into the folder as a starting point, once", async () => {
    settings.update((v) => { v.masters.default = null; });
    render(<SettingsSheet tab="master" onTab={() => undefined} onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "見本を取り込む" }));
    await waitFor(() => expect(screen.getByText("sample-master.pptx")).toBeInTheDocument());
    const m = useDeckStore.getState().masters.find((x) => x.name === "sample-master.pptx")!;
    expect(m.missing).toEqual([]);                                             // Cover / Agenda / Section / Body-Text all present
    expect(m.layouts.filter((l) => l.role).map((l) => l.name).sort()).toEqual(["Agenda", "Body-2col", "Body-Text", "Cover", "Section"]);
    expect(settings.get().masters.default).toBe("sample-master.pptx");
    await userEvent.click(screen.getByRole("button", { name: "見本を取り込む" }));
    expect(await screen.findByText(/すでに保管フォルダにあります/)).toBeInTheDocument(); // never overwrites an edited copy
    await userEvent.click(screen.getByText("削除"));
    await waitFor(() => expect(useDeckStore.getState().masters).toHaveLength(0));
  });
  it("warns when a master's body box runs into the footer", async () => {
    const { decoratedMaster } = await import("../helpers/decoratedMaster");
    const m = await importMaster(await decoratedMaster(), "deco.pptx");
    useDeckStore.setState({ masters: [{ ...m, id: "dir:deco.pptx", name: "deco.pptx" }] });
    render(<SettingsSheet tab="master" onTab={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText(/本文枠の下端がフッタと重なっています/)).toBeInTheDocument();
    expect(screen.queryByText(/本文枠の上端がヘッダ/)).toBeNull();
  });
  it("reports invalid files", async () => {
    render(<SettingsSheet tab="master" onTab={() => undefined} onClose={() => undefined} />);
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
    // every icon-only control explains itself on hover (data-tip, shown by Tooltips)
    const iconButtons = [...document.querySelectorAll(".btn.icon, .seg.icon")];
    expect(iconButtons.length).toBeGreaterThan(4);
    for (const b of iconButtons) expect(b.getAttribute("data-tip"), b.getAttribute("aria-label") ?? "").toBeTruthy();
    expect(screen.getAllByRole("button", { name: "設定" })[0]).toHaveAttribute("data-tip", "設定 (⌘,)");
    await userEvent.click(screen.getByRole("button", { name: "書き出す" }));
    await waitFor(() => expect(root.text("deck.json")).toContain('"version": 2'));
    expect(await screen.findByText(/deck.json を書き出しました/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await userEvent.click(screen.getByRole("button", { name: "マスター" }));
    expect(screen.getByText("スライドマスター")).toBeInTheDocument(); // the settings sheet, on its master tab
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "設定" })).toBeNull();
    fireEvent.keyDown(window, { key: ",", metaKey: true });
    expect(screen.getByRole("heading", { name: "一般" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await userEvent.click(screen.getByRole("button", { name: "設定" }));
    expect(screen.getByRole("dialog", { name: "設定" })).toBeInTheDocument();
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
    await userEvent.click(screen.getAllByRole("button", { name: "コンソールへ" })[1]);
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

import { cleanup as cleanupSplit, fireEvent as fireSplit, render as renderSplit, screen as screenSplit } from "@testing-library/react";
import { App as AppSplit } from "../../src/components/App";
import { settings as splitSettings } from "../../src/settings/settings";
import { useDeckStore as splitStore } from "../../src/store/deckStore";

describe("App: the editor pane width is draggable and remembered", () => {
  afterEach(() => cleanupSplit());
  it("drags the splitter between preview and editor and stores the width in settings", async () => {
    splitSettings.update((v) => { v.editor.width = null; });
    splitStore.setState({ started: true, workspace: null });
    renderSplit(<AppSplit />);
    const sep = await screenSplit.findByRole("separator", { name: "エディタの幅" });
    fireSplit.mouseDown(sep, { clientX: 1000 });
    fireSplit.mouseMove(window, { clientX: 900 }); // 100px to the left: the editor grows
    fireSplit.mouseUp(window);
    expect(splitSettings.get().editor.width).toBe(580); // 480px default when nothing is stored, +100
    const grid = sep.parentElement as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain("580px");
    fireSplit.mouseDown(sep, { clientX: 500 });
    fireSplit.mouseMove(window, { clientX: 2000 }); // far right: clamped to the minimum
    fireSplit.mouseUp(window);
    expect(splitSettings.get().editor.width).toBe(320);
  });
  it("drags the splitter between navigator and preview, clamps it, and stores the width", async () => {
    splitSettings.update((v) => { v.navigator.width = null; });
    splitStore.setState({ started: true, workspace: null });
    renderSplit(<AppSplit />);
    const sep = await screenSplit.findByRole("separator", { name: "サムネイルの幅" });
    const grid = sep.parentElement as HTMLElement;
    expect(grid.style.gridTemplateColumns.startsWith("232px")).toBe(true); // the default
    fireSplit.mouseDown(sep, { clientX: 232 });
    fireSplit.mouseMove(window, { clientX: 332 }); // 100px to the right: the navigator grows
    fireSplit.mouseUp(window);
    expect(splitSettings.get().navigator.width).toBe(332);
    expect(grid.style.gridTemplateColumns.startsWith("332px")).toBe(true);
    fireSplit.mouseDown(sep, { clientX: 332 });
    fireSplit.mouseMove(window, { clientX: 0 }); // far left: clamped to the minimum
    fireSplit.mouseUp(window);
    expect(splitSettings.get().navigator.width).toBe(140);
  });
});
