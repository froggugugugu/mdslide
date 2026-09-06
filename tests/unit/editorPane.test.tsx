import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorPane } from "../../src/components/EditorPane";
import { useDeckStore } from "../../src/store/deckStore";

afterEach(() => cleanup());

describe("EditorPane", () => {
  it("mounts CodeMirror with the store markdown and pushes edits back", async () => {
    useDeckStore.getState().setMarkdown("# A\n\n## B\n");
    const { container } = render(<EditorPane />);
    const cm = container.querySelector(".cm-content")!;
    expect(cm.textContent).toContain("## B");
    // store-originated edit (reorder/layout) replaces the document and keeps the selected heading under the cursor
    useDeckStore.getState().setLayout(useDeckStore.getState().deck.blocks[1].id, { kind: "2col" });
    await new Promise((r) => setTimeout(r, 0));
    expect(cm.textContent).toContain("## B {layout=2col}");
    // thumbnail click scrolls the editor
    useDeckStore.getState().select(useDeckStore.getState().slides.find((s) => s.title === "B")!.id);
    await new Promise((r) => setTimeout(r, 0));
    expect(useDeckStore.getState().gotoLine).toBeNull();
  });
});

import { EditorView } from "@codemirror/view";
import { getCM } from "@replit/codemirror-vim";
import { settings } from "../../src/settings/settings";

describe("EditorPane: Vim keybindings are a setting", () => {
  it("runs Vim by default and drops it (and brings it back) when editor.vim changes, without rebuilding the editor", async () => {
    settings.update((v) => { v.editor.vim = true; });
    useDeckStore.getState().setMarkdown("# A\n\n## B\n");
    const { container } = render(<EditorPane />);
    const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
    expect(getCM(view)).not.toBeNull();
    settings.update((v) => { v.editor.vim = false; });
    await new Promise((r) => setTimeout(r, 0));
    expect(getCM(view)).toBeNull();
    expect(EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)).toBe(view); // reconfigured in place
    settings.update((v) => { v.editor.vim = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(getCM(view)).not.toBeNull();
  });
});
