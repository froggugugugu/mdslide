import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolsSheet } from "../../src/components/ToolsSheet";
import { settings } from "../../src/settings/settings";

afterEach(() => cleanup());
beforeEach(() => { settings.update((v) => { v.editor.vim = true; }); });

describe("ToolsSheet: editor section", () => {
  it("toggles Vim keybindings and stores the choice in settings", async () => {
    render(<ToolsSheet onClose={() => undefined} />);
    const box = screen.getByRole("checkbox", { name: "Vim キーバインド" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(settings.get().editor.vim).toBe(false);
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(settings.get().editor.vim).toBe(true);
  });
});
