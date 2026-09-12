import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The desktop build: isElectron is decided when the workspace module loads, so the bridge must exist before imports run.
const api = vi.hoisted(() => {
  const api = {
    platform: "darwin",
    settingsPath: async () => "/Users/me/.config/mdslide/settings.json",
    settingsRead: async () => null,
    settingsWrite: async () => undefined,
    checkPython: vi.fn(),
  };
  (window as unknown as { mdslide: unknown }).mdslide = api;
  return api;
});

import { SettingsSheet } from "../../src/components/SettingsSheet";
import { installCommands, usePythonStore } from "../../src/export/python";
import { settings } from "../../src/settings/settings";

const VENV = "/Users/me/.config/mdslide/venv";
const missing = { ok: false, problem: "no-pptx", python: "/usr/bin/python3", version: "3.9.6", venv: VENV, tried: ["/usr/bin/python3"] };
const good = { ok: true, python: `${VENV}/bin/python3`, version: "3.12.4", pptx: "1.0.2", venv: VENV, tried: [`${VENV}/bin/python3`] };
const written: string[] = [];
const sheet = () => render(<SettingsSheet tab="export" onTab={() => undefined} onClose={() => undefined} />);

beforeEach(() => {
  usePythonStore.setState({ check: null, checking: false, dismissed: false });
  api.checkPython.mockReset();
  written.length = 0;
  Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => { written.push(t); } }, configurable: true });
});
afterEach(() => cleanup());

describe("Settings: 書き出し", () => {
  it("checks when opened, explains how to install python-pptx, copies the commands, and re-checks", async () => {
    api.checkPython.mockResolvedValueOnce(missing).mockResolvedValueOnce(good);
    sheet();
    expect(await screen.findByText("python-pptx が入っていません。Python 3.9.6 は見つかりました")).toBeInTheDocument();
    const venvCmd = screen.getByLabelText("専用の環境に入れるコマンド");
    expect(venvCmd.textContent).toBe(`python3 -m venv ${VENV}\n${VENV}/bin/python -m pip install python-pptx`);
    expect(screen.queryByLabelText("Command Line Tools のコマンド")).toBeNull(); // Python itself is there
    await userEvent.click(screen.getAllByRole("button", { name: "コピー" })[0]);
    expect(written.at(-1)).toBe(venvCmd.textContent);
    expect(screen.getByRole("button", { name: "コピーしました" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再確認" }));
    expect(await screen.findByText("使えます。python-pptx 1.0.2、Python 3.12.4")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "入れ方" })).toBeNull();
    expect(api.checkPython).toHaveBeenCalledTimes(2);
  });

  it("starts with the Command Line Tools when no usable Python exists, and quotes a folder with a space", async () => {
    api.checkPython.mockResolvedValueOnce({ ok: false, problem: "needs-clt", venv: "/Users/me/Library/Application Support/mdslide/venv", tried: [] });
    sheet();
    expect(await screen.findByText("Python を使うには Command Line Tools が必要です")).toBeInTheDocument();
    expect(screen.getByLabelText("Command Line Tools のコマンド").textContent).toBe("xcode-select --install");
    expect(screen.getByLabelText("専用の環境に入れるコマンド").textContent).toContain('"/Users/me/Library/Application Support/mdslide/venv/bin/python" -m pip install python-pptx');
  });

  it("stores an explicit Python path, empty meaning automatic", async () => {
    api.checkPython.mockResolvedValue(good);
    sheet();
    const box = await screen.findByRole("textbox", { name: "Python の場所" });
    await userEvent.type(box, "/opt/py/bin/python3");
    expect(settings.get().export.python).toBe("/opt/py/bin/python3");
    await userEvent.clear(box);
    expect(settings.get().export.python).toBeNull();
  });

  it("builds commands from the default place before the first check", () => {
    expect(installCommands(null).venv).toEqual(["python3 -m venv ~/.config/mdslide/venv", "~/.config/mdslide/venv/bin/python -m pip install python-pptx"]);
  });
});
