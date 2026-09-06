import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const xterm = vi.hoisted(() => {
  const instances: FakeTerm[] = [];
  class FakeTerm {
    cols = 80; rows = 24; options: Record<string, unknown> = {}; written: string[] = []; dataCb: ((d: string) => void) | null = null; disposed = false;
    constructor(public opts: Record<string, unknown>) { instances.push(this); }
    loadAddon() {} open() {} focus() {} dispose() { this.disposed = true; }
    write(d: string) { this.written.push(d); }
    onData(cb: (d: string) => void) { this.dataCb = cb; return { dispose: () => { this.dataCb = null; } }; }
  }
  return { instances, FakeTerm };
});
vi.mock("@xterm/xterm", () => ({ Terminal: xterm.FakeTerm }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.hoisted(() => { (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => null; });
const kv = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => kv.get(k), set: async (k: string, v: unknown) => { kv.set(k, v); },
  del: async (k: string) => { kv.delete(k); }, keys: async () => [...kv.keys()],
}));

import { TerminalPane } from "../../src/components/TerminalPane";
import { SettingsHost, useSettingsSheet } from "../../src/components/SettingsSheet";
import { HelpSheet } from "../../src/components/HelpSheet";
import { App } from "../../src/components/App";
import { useTerminalStore, type PtyBridge } from "../../src/console/terminalStore";
import { useToolsStore } from "../../src/console/toolsStore";
import { useDeckStore } from "../../src/store/deckStore";

function fakePty() {
  const data: ((id: number, d: string) => void)[] = []; const exit: ((id: number, c: number) => void)[] = [];
  const b: PtyBridge & { written: string[]; emitData: (d: string) => void; emitExit: (c: number) => void } = {
    written: [],
    spawn: vi.fn(async () => 3), write: vi.fn(async (_id, d) => { b.written.push(d); }), resize: vi.fn(async () => undefined), kill: vi.fn(async () => undefined),
    onData: (cb) => { data.push(cb); return () => undefined; }, onExit: (cb) => { exit.push(cb); return () => undefined; },
    emitData: (d) => data.forEach((f) => f(3, d)), emitExit: (c) => exit.forEach((f) => f(3, c)),
  };
  return b;
}

afterEach(() => cleanup());
beforeEach(async () => { localStorage.clear(); await (await import("../../src/settings/settings")).settings.load(); useTerminalStore.getState().reset(); useToolsStore.getState().reset(); useSettingsSheet.getState().close(); xterm.instances.length = 0; });

describe("TerminalPane", () => {
  it("explains itself without a desktop workspace", () => {
    useDeckStore.setState({ workspace: null });
    render(<TerminalPane />);
    expect(screen.getByText("デスクトップ版でフォルダを開くと使えます")).toBeInTheDocument();
    expect(xterm.instances).toHaveLength(1);
  });
  it("spawns the shell in the folder, pipes data both ways, auto-runs claude, handles exit and restart", async () => {
    const b = fakePty();
    useDeckStore.setState({ workspace: { name: "deck", path: "/w/deck", deckFile: "deck.md", backend: { pty: b } as never } });
    render(<><TerminalPane /><SettingsHost /></>); // the bar's gear opens the settings sheet, which App hosts
    await screen.findByText("/w/deck");
    expect(b.spawn).toHaveBeenCalledWith({ cwd: "/w/deck", cols: 80, rows: 24 });
    expect(b.written).toEqual(["claude\r"]);
    b.emitData("hello");
    expect(xterm.instances[0].written).toEqual(["hello"]);
    xterm.instances[0].dataCb?.("ls\r");
    expect(b.written).toContain("ls\r");
    await userEvent.click(screen.getByRole("button", { name: "起動" }));
    expect(b.written.filter((w) => w === "claude\r")).toHaveLength(2);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "起動するツール" }), "gemini");
    await userEvent.click(screen.getByRole("button", { name: "起動" }));
    expect(b.written.at(-1)).toBe("gemini\r");
    b.emitExit(0);
    expect(await screen.findByText("シェルが終了しました (0)")).toBeInTheDocument();
    expect(b.spawn).toHaveBeenCalledTimes(1); // no automatic respawn loop
    await userEvent.click(screen.getByRole("button", { name: "再起動" }));
    await screen.findByText("/w/deck");
    expect(b.spawn).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "終了" }));
    expect(b.kill).toHaveBeenCalledWith(3);
    expect(await screen.findByText("停止中")).toBeInTheDocument();
    // settings sheet (tools tab): auto-start off, add a custom tool, select it, launch, remove it
    await userEvent.click(screen.getByRole("button", { name: "ツール設定" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "自動起動" }));
    expect(useTerminalStore.getState().autoStart).toBe(false);
    await userEvent.type(screen.getByRole("textbox", { name: "新しいツールのコマンド" }), "mytool");
    await userEvent.type(screen.getByRole("textbox", { name: "新しいツールの引数" }), "--yes{Enter}");
    expect(screen.getByRole("textbox", { name: "mytool の名前" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "mytool を選択" }));
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await userEvent.click(screen.getByRole("button", { name: "再起動" }));
    await screen.findByText("/w/deck");
    await userEvent.click(screen.getByRole("button", { name: "起動" }));
    expect(b.written.at(-1)).toBe("mytool --yes\r");
    await userEvent.click(screen.getByRole("button", { name: "ツール設定" }));
    await userEvent.click(screen.getByRole("button", { name: "mytool を削除" }));
    expect(screen.queryByRole("textbox", { name: "mytool の名前" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Claude Code の引数" }), "--verbose");
    expect(useToolsStore.getState().tools[0].args).toBe("--verbose");
    await userEvent.click(screen.getByRole("button", { name: "プリセットを既定に戻す" }));
    expect(useToolsStore.getState().tools[0].args).toBe("");
  });
});

describe("HelpSheet", () => {
  it("lists workflow, syntax, shortcuts and the terminal, and closes", async () => {
    const onClose = vi.fn();
    render(<HelpSheet onClose={onClose} />);
    expect(screen.getByText("mdslide の使い方")).toBeInTheDocument();
    expect(screen.getByText(/img=3\/4 side=left/)).toBeInTheDocument();
    expect(screen.getByText(/:body :section/)).toBeInTheDocument();
    // frontmatter: every key the parser knows is explained
    expect(screen.getByText(/表紙情報/)).toBeInTheDocument();
    for (const key of ["title", "subtitle", "author", "date", "agenda", "numbering", "master", "layout", "fontSize", "imageMaxPx"]) {
      expect(screen.getByText(new RegExp(`^${key}: `))).toBeInTheDocument();
    }
    expect(screen.getByText(/選んだスライドを上 \/ 下へ移動/)).toBeInTheDocument();
    expect(screen.getByText(/本物のターミナル/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("App: first-run help, console toggle, shortcuts, splitter", () => {
  it("works end to end", async () => {
    render(<App />);
    expect(await screen.findByText("mdslide の使い方")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    const { settings } = await import("../../src/settings/settings");
    expect(settings.get().help.seen).toBe(true);
    expect(screen.getByTestId("console")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(screen.queryByTestId("console")).not.toBeInTheDocument();
    expect(settings.get().console.open).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "コンソール" }));
    expect(screen.getByTestId("console")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(screen.getByText("mdslide の使い方")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    expect(screen.queryByText("mdslide の使い方")).not.toBeInTheDocument();
    const sep = screen.getByRole("separator", { name: "コンソールの高さ" });
    fireEvent.mouseDown(sep, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 400 });
    fireEvent.mouseUp(window);
    expect(settings.get().console.height).toBe(360);
    await settings.flush();
    expect(JSON.parse(localStorage.getItem("mdslide:settings")!).console.height).toBe(360);
    cleanup();
    render(<App />);
    await screen.findByRole("button", { name: "コンソール" });
    expect(screen.queryByText("mdslide の使い方")).not.toBeInTheDocument();
  });
});
