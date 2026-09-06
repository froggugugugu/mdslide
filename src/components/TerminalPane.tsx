import { useEffect, useRef } from "react";
import { useToolsStore } from "../console/toolsStore";
import { useSettingsSheet } from "./SettingsSheet";
import { Icon } from "./Icon";
import { isDark, onAppearanceChange } from "../settings/appearance";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalStore } from "../console/terminalStore";
import { useDeckStore } from "../store/deckStore";

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function themeFromCss() {
  const dark = isDark();
  return {
    background: "rgba(0,0,0,0)",
    foreground: cssVar("--ink") || (dark ? "#f5f5f7" : "#1d1d1f"),
    cursor: cssVar("--accent") || "#0a84ff",
    selectionBackground: dark ? "rgba(10,132,255,0.35)" : "rgba(10,132,255,0.22)",
    black: dark ? "#1e1e1e" : "#1d1d1f", brightBlack: "#6e6e73",
    red: "#ff453a", green: "#30d158", yellow: "#ffd60a", blue: "#0a84ff", magenta: "#bf5af2", cyan: "#64d2ff",
    white: dark ? "#f5f5f7" : "#d1d1d6", brightWhite: "#ffffff",
  };
}

/**
 * A real terminal (your login shell in the deck folder). Claude Code is started automatically unless turned off.
 * The terminal instance is exposed as window.__mdslideTerminal for end-to-end tests.
 */
export function TerminalPane() {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const workspace = useDeckStore((s) => s.workspace);
  const ptyId = useTerminalStore((s) => s.ptyId);
  const exitCode = useTerminalStore((s) => s.exitCode);
  const status = useTerminalStore((s) => s.status);
  const runTool = useTerminalStore((s) => s.runTool);
  const tools = useToolsStore((s) => s.tools);
  const selectedTool = useToolsStore((s) => s.selectedId);
  const selectTool = useToolsStore((s) => s.select);
  const openSettings = useSettingsSheet((s) => s.open);
  const start = useTerminalStore((s) => s.start);
  const stop = useTerminalStore((s) => s.stop);
  const bridge = workspace?.backend.pty ?? null;

  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({ fontFamily: cssVar("--font-mono") || "Menlo, monospace", fontSize: 12.5, lineHeight: 1.25, cursorBlink: true, allowProposedApi: true, theme: themeFromCss(), macOptionIsMeta: true, scrollback: 5000 });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    f.fit();
    term.current = t; fit.current = f;
    (window as unknown as { __mdslideTerminal?: Terminal }).__mdslideTerminal = t;
    const st = useTerminalStore.getState();
    st.setOnData((d) => t.write(d));
    const sub = t.onData((d) => { void useTerminalStore.getState().write(d); });
    const ro = new ResizeObserver(() => { f.fit(); void useTerminalStore.getState().resize(t.cols, t.rows); });
    ro.observe(host.current);
    const offScheme = onAppearanceChange(() => { t.options.theme = themeFromCss(); });
    return () => { offScheme(); ro.disconnect(); sub.dispose(); st.setOnData(null); t.dispose(); term.current = null; };
  }, []);

  // Spawn a shell the first time a desktop workspace is open. After the shell exits or is stopped, the user restarts it.
  useEffect(() => {
    if (!bridge || !workspace?.path || status !== "idle" || !term.current) return;
    void start(bridge, workspace.path, term.current.cols, term.current.rows);
  }, [bridge, workspace?.path, status, start]);

  return (
    <div className="console h-full flex flex-col" data-testid="console">
      <div className="console-bar">
        <span className="console-title">コンソール</span>
        <span className="console-meta">
          {!bridge ? "デスクトップ版でフォルダを開くと使えます" : ptyId !== null ? workspace?.path : status === "exited" ? `シェルが終了しました (${exitCode})` : status === "stopped" ? "停止中" : "起動中"}
        </span>
        <span className="flex-1" />
        <select className="select small" aria-label="起動するツール" value={selectedTool} onChange={(e) => selectTool(e.target.value)}>
          {tools.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn icon" onClick={() => runTool()} disabled={ptyId === null} aria-label="起動" title="選択中のツールを起動"><Icon name="play" /></button>
        <button className="btn icon" onClick={() => openSettings("tools")} aria-label="ツール設定" title="ツール設定（自動起動・コマンド）"><Icon name="gear" /></button>
        {ptyId !== null
          ? <button className="btn icon" onClick={() => stop()} aria-label="終了" title="シェルを終了"><Icon name="stop" /></button>
          : bridge && <button className="btn icon" onClick={() => term.current && start(bridge, workspace!.path!, term.current.cols, term.current.rows)} aria-label="再起動" title="シェルを再起動"><Icon name="restart" /></button>}
      </div>
      <div ref={host} className="terminal-host" onClick={() => term.current?.focus()} />
    </div>
  );
}
