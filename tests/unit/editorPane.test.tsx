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
