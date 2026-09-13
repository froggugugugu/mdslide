import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { CompletionContext } from "@codemirror/autocomplete";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appShortcuts, imageBaseName, imageDropPaste, insertImage, jumpHeading, registerVimMotions, snippetSource } from "../../src/components/editorExtensions";
import { useDeckStore } from "../../src/store/deckStore";

const DOC = `---\ntitle: T\n---\n\n# 章\n\n## 2.x 図の説明 {img=1/2}\n\n- a\n\n![TODO 構成図]()\n\n## 次\n`;

function mk(doc = DOC, extensions: unknown[] = []) {
  const parent = document.createElement("div"); document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create({ doc, extensions: extensions as never }), parent });
}
const lineFrom = (v: EditorView, n: number) => v.state.doc.line(n).from;

describe("imageBaseName", () => {
  beforeEach(() => useDeckStore.getState().setMarkdown(DOC));
  it("uses the nearest heading above the cursor with its slide number", () => {
    const v = mk();
    expect(imageBaseName(v, lineFrom(v, 9))).toBe("1-1-2-x-図の説明");
    expect(imageBaseName(v, lineFrom(v, 13))).toBe("1-2-次");
    expect(imageBaseName(v, lineFrom(v, 5))).toBe("1-章");
    expect(imageBaseName(v, 0)).toMatch(/^image-/);
  });
});

describe("insertImage", () => {
  it("replaces a placeholder on the cursor line", () => {
    const v = mk();
    v.dispatch({ selection: { anchor: lineFrom(v, 11) } });
    insertImage(v, "images/a.png");
    expect(v.state.doc.line(11).text).toBe("![構成図](images/a.png)");
  });
  it("otherwise inserts on its own line after the cursor line", () => {
    const v = mk();
    v.dispatch({ selection: { anchor: lineFrom(v, 9) } }); // "- a"
    insertImage(v, "images/b.png");
    expect(v.state.doc.line(10).text).toBe("");
    expect(v.state.doc.line(11).text).toBe("![b](images/b.png)");
    expect(v.state.doc.line(12).text).toBe("");
    v.dispatch({ selection: { anchor: lineFrom(v, 12) } }); // blank line: image goes here, blank kept before the next text
    insertImage(v, "images/c.png");
    expect(v.state.doc.line(12).text).toBe("![c](images/c.png)");
    expect(v.state.doc.line(13).text).toBe("");
    expect(v.state.doc.line(14).text).toBe("![TODO 構成図]()");
  });
});

describe("paste / drop handlers", () => {
  it("saves pasted images through the store and inserts a reference", async () => {
    useDeckStore.getState().setMarkdown(DOC);
    const paste = vi.spyOn(useDeckStore.getState(), "pasteImage").mockResolvedValue("images/p.png");
    useDeckStore.setState({ pasteImage: paste as never });
    const v = mk(DOC, [imageDropPaste]);
    v.dispatch({ selection: { anchor: lineFrom(v, 11) } });
    const file = new File([new Uint8Array([1])], "s.png", { type: "image/png" });
    const dt = { files: [file], types: ["Files"] } as unknown as DataTransfer;
    const ev = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(ev, "clipboardData", { value: dt });
    v.contentDOM.dispatchEvent(ev);
    await vi.waitFor(() => expect(v.state.doc.toString()).toContain("![構成図](images/p.png)"));
    expect(paste).toHaveBeenCalledWith(file, "1-1-2-x-図の説明");
    // non-image paste is left to the editor
    const ev2 = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev2, "clipboardData", { value: { files: [], types: ["text/plain"], getData: () => "plain" } });
    v.contentDOM.dispatchEvent(ev2);
    expect(v.state.doc.toString()).toContain("plain"); // CodeMirror's own paste handled it
    expect(paste).toHaveBeenCalledTimes(1);
  });
  it("reports failures from the store", async () => {
    useDeckStore.setState({ pasteImage: (async () => { throw new Error("no folder"); }) as never });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const v = mk(DOC, [imageDropPaste]);
    const file = new File([new Uint8Array([1])], "s.png", { type: "image/png" });
    const ev = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: { files: [file] } });
    Object.assign(ev, { clientX: 10, clientY: 10 });
    v.contentDOM.dispatchEvent(ev);
    await vi.waitFor(() => expect(alert).toHaveBeenCalledWith("no folder"));
    alert.mockRestore();
  });
});

describe("snippets", () => {
  it("offers block templates after ':' or on explicit request", () => {
    const state = EditorState.create({ doc: ":bo" });
    const r = snippetSource(new CompletionContext(state, 3, false))!;
    expect(r.from).toBe(0);
    expect(r.options.map((o) => o.label)).toContain(":body");
    expect(snippetSource(new CompletionContext(EditorState.create({ doc: "abc" }), 3, false))).toBeNull();
    expect(snippetSource(new CompletionContext(EditorState.create({ doc: "abc" }), 3, true))!.from).toBe(3);
  });
});

describe("heading motions", () => {
  it("jumps to next/previous heading and stops at the ends", () => {
    const v = mk();
    expect(jumpHeading(v, 1)).toBe(true);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(5);
    jumpHeading(v, 1); jumpHeading(v, 1);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(13);
    expect(jumpHeading(v, 1)).toBe(false);
    jumpHeading(v, -1);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(7);
  });
  it("registers vim mappings once", () => {
    expect(() => { registerVimMotions(); registerVimMotions(); }).not.toThrow();
  });
});

describe("appShortcuts: ⌘/ (help) and ⌘I (drafts) belong to the app, not to CodeMirror", () => {
  const DOC = "## a\n- b **c**";
  const press = (view: EditorView, key: string) => {
    const mac = /Mac/.test(navigator.platform);
    return runScopeHandlers(view, new KeyboardEvent("keydown", { key, metaKey: mac, ctrlKey: !mac }), "editor");
  };
  const editor = (extensions: unknown[]) => new EditorView({
    state: EditorState.create({ doc: DOC, selection: { anchor: 12 }, extensions: [...extensions, basicSetup, markdown()] as never }),
    parent: document.body,
  });

  it("without them the editor comments the line out and selects the syntax around the cursor", () => {
    const view = editor([]);
    press(view, "i");
    expect(view.state.selection.main.empty).toBe(false);
    press(view, "/");
    expect(view.state.doc.toString()).toContain("<!--");
    view.destroy();
  });

  it("with them the document and the selection stay as they were", () => {
    const view = editor([appShortcuts]);
    press(view, "/");
    press(view, "i");
    expect(view.state.doc.toString()).toBe(DOC);
    expect(view.state.selection.main.empty).toBe(true);
    view.destroy();
  });
});
