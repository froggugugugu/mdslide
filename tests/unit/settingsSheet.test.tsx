import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsHost, SettingsSheet, useSettingsSheet } from "../../src/components/SettingsSheet";
import { settings } from "../../src/settings/settings";
import { useTerminalStore } from "../../src/console/terminalStore";

const noop = () => undefined;
afterEach(() => { cleanup(); useSettingsSheet.getState().close(); });
beforeEach(() => {
  settings.update((v) => { v.editor.vim = true; v.appearance.theme = "auto"; v.editor.width = 500; v.navigator.width = 300; v.console.autoStart = true; });
});

describe("SettingsSheet", () => {
  it("opens on the requested tab, switches tabs, and closes with the button and Escape", async () => {
    const onClose = vi.fn(); const onTab = vi.fn();
    render(<SettingsSheet tab="editor" onTab={onTab} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "設定" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "エディタ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "エディタ" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "ツール" }));
    expect(onTab).toHaveBeenCalledWith("tools");
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("一般: the appearance control writes the setting", async () => {
    render(<SettingsSheet tab="general" onTab={noop} onClose={noop} />);
    await userEvent.click(screen.getByRole("button", { name: "ダーク" }));
    expect(settings.get().appearance.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "ダーク" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "自動" }));
    expect(settings.get().appearance.theme).toBe("auto");
  });
  it("エディタ: toggles Vim keybindings and resets both pane widths", async () => {
    render(<SettingsSheet tab="editor" onTab={noop} onClose={noop} />);
    const box = screen.getByRole("checkbox", { name: "Vim キーバインド" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(settings.get().editor.vim).toBe(false);
    expect(box).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "既定の幅に戻す" }));
    expect(settings.get().editor.width).toBeNull();
    expect(settings.get().navigator.width).toBeNull();
  });
  it("ツール: the auto-start switch lives here", async () => {
    useTerminalStore.getState().reset();
    render(<SettingsSheet tab="tools" onTab={noop} onClose={noop} />);
    const box = screen.getByRole("checkbox", { name: "自動起動" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(settings.get().console.autoStart).toBe(false);
    expect(useTerminalStore.getState().autoStart).toBe(false);
  });
  it("SettingsHost renders the sheet for the store's tab and nothing otherwise", () => {
    const { container } = render(<SettingsHost />);
    expect(container.innerHTML).toBe("");
    act(() => useSettingsSheet.getState().open("master"));
    expect(screen.getByRole("heading", { name: "スライドマスター" })).toBeInTheDocument();
    act(() => useSettingsSheet.getState().open());
    expect(screen.getByRole("heading", { name: "一般" })).toBeInTheDocument(); // default tab
    act(() => useSettingsSheet.getState().close());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
