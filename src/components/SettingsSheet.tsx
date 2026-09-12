import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Icon, type IconName } from "./Icon";
import { settings, type SettingsFile } from "../settings/settings";
import { THEMES } from "../settings/appearance";
import { masterSource } from "../master/masterSource";
import { SAMPLE_MASTER_NAME, sampleMasterBlob } from "../master/sampleMaster";
import { bodyOverlaps } from "../model/boxes";
import { copyText } from "../model/refs";
import { installCommands, usePythonStore } from "../export/python";
import { useDeckStore } from "../store/deckStore";
import { isPreset, useToolsStore } from "../console/toolsStore";
import { useTerminalStore } from "../console/terminalStore";
import { isElectron } from "../workspace/workspace";

export type SettingsTab = "general" | "editor" | "master" | "export" | "tools";
const TABS: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: "general", label: "一般", icon: "gear" },
  { id: "editor", label: "エディタ", icon: "layoutText" },
  { id: "master", label: "マスター", icon: "master" },
  { id: "export", label: "書き出し", icon: "export" },
  { id: "tools", label: "ツール", icon: "terminal" },
];

/** Which tab is open, if any. Anything may open the sheet (toolbar, ⌘,, the app menu, the console bar); App renders it once. */
interface SheetState { tab: SettingsTab | null; open: (tab?: SettingsTab) => void; close: () => void }
export const useSettingsSheet = create<SheetState>((set) => ({ tab: null, open: (tab = "general") => set({ tab }), close: () => set({ tab: null }) }));

export function SettingsHost() {
  const tab = useSettingsSheet((s) => s.tab);
  const open = useSettingsSheet((s) => s.open);
  const close = useSettingsSheet((s) => s.close);
  return tab ? <SettingsSheet tab={tab} onTab={open} onClose={close} /> : null;
}

/** Subscribe to one slice of the settings file. `pick` must be a stable function (module level). */
function useSetting<T>(pick: (s: SettingsFile) => T): T {
  const [v, setV] = useState(() => pick(settings.get()));
  useEffect(() => settings.subscribe((s) => setV(pick(s))), [pick]);
  return v;
}
const pickTheme = (s: SettingsFile) => s.appearance.theme;
const pickVim = (s: SettingsFile) => s.editor.vim;
const pickDefaultMaster = (s: SettingsFile) => s.masters.default;
const pickPython = (s: SettingsFile) => s.export.python;

/**
 * App settings only: how mdslide behaves on this machine. What a document says (its master, layouts, sizes) stays on the
 * main screen and in the Markdown. Laid out like macOS Preferences: categories on the left, one page on the right.
 */
export function SettingsSheet({ tab, onTab, onClose }: { tab: SettingsTab; onTab: (t: SettingsTab) => void; onClose: () => void }) {
  const [filePath, setFilePath] = useState<string | null>(null);
  useEffect(() => { if (window.mdslide) window.mdslide.settingsPath().then(setFilePath); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet settings" role="dialog" aria-label="設定" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav" aria-label="設定の分類">
          {TABS.map((t) => (
            <button key={t.id} className={`settings-tab ${tab === t.id ? "on" : ""}`} onClick={() => onTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <Icon name={t.icon} />{t.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          <div className="settings-page">
            {tab === "general" && <GeneralTab />}
            {tab === "editor" && <EditorTab />}
            {tab === "master" && <MasterTab />}
            {tab === "export" && <ExportTab />}
            {tab === "tools" && <ToolsTab />}
          </div>
          <div className="settings-foot">
            {filePath
              ? <button className="link" title={filePath} onClick={() => { void settings.flush().then(() => window.mdslide?.openPath(filePath)); }}>settings.json を開く</button>
              : <span className="preset">設定は {settings.backend.path} に保存</span>}
            <span className="flex-1" />
            <button className="btn primary" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralTab() {
  const theme = useSetting(pickTheme);
  return (
    <>
      <h2>一般</h2>
      <div className="settings-row">
        <div className="settings-label">外観</div>
        <div className="segmented" role="group" aria-label="外観">
          {THEMES.map((t) => (
            <button key={t.id} className={`seg ${theme === t.id ? "on" : ""}`} aria-pressed={theme === t.id} onClick={() => settings.update((v) => { v.appearance.theme = t.id; })}>{t.label}</button>
          ))}
        </div>
        <div className="settings-hint">「自動」は macOS の外観に合わせる。ウィンドウとサイドバーの透過も同じ側に揃う</div>
      </div>
    </>
  );
}

function EditorTab() {
  const vim = useSetting(pickVim);
  return (
    <>
      <h2>エディタ</h2>
      <label className="settings-row">
        <div className="settings-label">Vim キーバインド</div>
        <input type="checkbox" checked={vim} onChange={(e) => settings.update((v) => { v.editor.vim = e.target.checked; })} aria-label="Vim キーバインド" />
        <div className="settings-hint">オフにすると通常のテキスト編集（矢印キー・Shift 選択・⌘S 保存）</div>
      </label>
      <div className="settings-row">
        <div className="settings-label">ペインの幅</div>
        <div><button className="btn" onClick={() => settings.update((v) => { v.navigator.width = null; v.editor.width = null; })}>既定の幅に戻す</button></div>
        <div className="settings-hint">サムネイルとエディタの幅。区切り線のドラッグで変わり、次回も同じ幅になる</div>
      </div>
    </>
  );
}

/** The masters folder: what it holds, the default for decks that name none. Which master a deck uses is chosen on the toolbar. */
function MasterTab() {
  const masters = useDeckStore((s) => s.masters);
  const masterErrors = useDeckStore((s) => s.masterErrors);
  const refresh = useDeckStore((s) => s.refreshMasters);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dir, setDir] = useState<string | null>(null);
  const defaultName = useSetting(pickDefaultMaster);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void masterSource.dir().then(setDir); }, []);

  const add = async (file?: File) => {
    setBusy(true); setError(null);
    try {
      const name = await masterSource.add(file);
      if (!name) return;
      await refresh();
      const err = useDeckStore.getState().masterErrors[name];
      if (err) {
        if (masterSource.kind === "memory") { await masterSource.remove(name); await refresh(); } // nothing to keep in memory
        throw new Error(err);
      }
      // The first master becomes the default: a deck that names none picks it up without its Markdown being touched.
      if (!settings.get().masters.default) settings.update((v) => { v.masters.default = name; });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  /** The bundled sample goes into the folder as a starting point: open it in PowerPoint, adjust, save over. */
  const addSample = async () => {
    setBusy(true); setError(null);
    try {
      if (masters.some((m) => m.name === SAMPLE_MASTER_NAME) || SAMPLE_MASTER_NAME in masterErrors) {
        throw new Error(`${SAMPLE_MASTER_NAME} はすでに保管フォルダにあります。PowerPoint で開いて編集するか、削除してから取り込み直してください。`);
      }
      const name = await masterSource.addBlob(SAMPLE_MASTER_NAME, await sampleMasterBlob());
      await refresh();
      if (!settings.get().masters.default) settings.update((v) => { v.masters.default = name; });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  const remove = async (name: string) => {
    await masterSource.remove(name);
    if (defaultName === name) settings.update((v) => { v.masters.default = null; });
    await refresh();
  };
  const changeDir = async () => {
    if (!masterSource.chooseDir || !(await masterSource.chooseDir())) return;
    setDir(await masterSource.dir());
    await refresh();
  };
  const wsMaster = masters.find((m) => m.id.startsWith("ws:"));
  const dirMasters = masters.filter((m) => m.id.startsWith("dir:"));
  const summary = (m: typeof masters[number]) => (
    <>
      <div className="mt-2 text-[12px]" style={{ color: "var(--ink-2)" }}>{m.layouts.filter((l) => l.role).map((l) => l.name).join(" · ") || "対応レイアウトなし"}</div>
      {m.missing.length > 0 && <div className="mt-1 text-[12px]" style={{ color: "var(--warn)" }}>不足: {m.missing.join(", ")}</div>}
      {m.unmapped.length > 0 && <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>未使用: {m.unmapped.join(", ")}</div>}
      {bodyOverlaps(m).footer && <div className="mt-1 text-[12px]" style={{ color: "var(--warn)" }}>本文枠の下端がフッタと重なっています。自動分割はフッタの手前までで計算します</div>}
      {bodyOverlaps(m).header && <div className="mt-1 text-[12px]" style={{ color: "var(--warn)" }}>本文枠の上端がヘッダと重なっています。PowerPoint のスライドマスターで本文枠を下げてください</div>}
    </>
  );

  return (
    <>
      <h2>スライドマスター</h2>
      <p>レイアウト名を Cover / Agenda / Section / Body-Text / Body-2col と付けた pptx を保管フォルダに置きます。資料ごとに使うものはツールバーで選び、Markdown の frontmatter に <code>master:</code> として書かれます。選んでいない資料は既定のマスターを使います。書式・配色・ロゴはパワポ側で整えてください。</p>
      {isElectron && (
        <div className="master-dir">
          <span className="truncate" title={dir ?? ""}>保管フォルダ: {dir ?? "…"}</span>
          <button className="link" onClick={() => void changeDir()}>変更</button>
          <button className="link" onClick={() => void masterSource.reveal?.()}>Finder で表示</button>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".pptx,.potx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void add(f); e.target.value = ""; }} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn primary with-icon" onClick={() => { if (isElectron) void add(); else fileRef.current?.click(); }} disabled={busy}><Icon name="plus" />{busy ? "取り込み中" : "pptx を取り込む"}</button>
        <button className="btn with-icon" onClick={() => void addSample()} disabled={busy} data-tip={`${SAMPLE_MASTER_NAME} を保管フォルダに置く`}><Icon name="master" />見本を取り込む</button>
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>見本（{SAMPLE_MASTER_NAME}）は Office 標準テーマのレイアウトに規約どおりの名前を付けたものです。取り込んだら「Finder で表示」から PowerPoint で開き、配色やロゴを直して上書き保存すれば、そのまま自分のマスターになります。</p>
      {error && <p className="mt-3" style={{ color: "var(--warn)" }}>{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {wsMaster && (
          <div className="card">
            <span className="font-medium">このフォルダの master.pptx</span>
            <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>frontmatter に master: が無い資料では、既定より先にこれが使われる</div>
            {summary(wsMaster)}
          </div>
        )}
        {dirMasters.length === 0 && Object.keys(masterErrors).length === 0 && <p>まだ取り込んだマスターはありません。</p>}
        {dirMasters.map((m) => (
          <div key={m.id} className={`card ${defaultName === m.name ? "on" : ""}`}>
            <div className="flex items-center gap-3">
              <span className="font-medium flex-1">{m.name}</span>
              {defaultName === m.name
                ? <span style={{ color: "var(--ink-2)" }}>既定</span>
                : <button className="link" style={{ color: "var(--ink-2)" }} onClick={() => settings.update((v) => { v.masters.default = m.name; })}>既定にする</button>}
              <button className="link" style={{ color: "var(--ink-2)" }} onClick={() => void remove(m.name)}>削除</button>
            </div>
            {summary(m)}
          </div>
        ))}
        {Object.entries(masterErrors).map(([name, err]) => (
          <div key={name} className="card">
            <div className="flex items-center gap-3">
              <span className="font-medium flex-1">{name}</span>
              <button className="link" style={{ color: "var(--ink-2)" }} onClick={() => void remove(name)}>削除</button>
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "var(--warn)" }}>読み込めません: {err}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Writing pptx needs Python with python-pptx on this Mac: its status, where the app looks, and how to install it (ADR-0019). */
function ExportTab() {
  const check = usePythonStore((s) => s.check);
  const checking = usePythonStore((s) => s.checking);
  const run = usePythonStore((s) => s.run);
  const configured = useSetting(pickPython);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { if (isElectron && !usePythonStore.getState().check) void usePythonStore.getState().run(); }, []);
  const cmds = installCommands(check);
  const command = (label: string, lines: string[]) => {
    const text = lines.join("\n");
    const copy = () => { void copyText(text).then((ok) => { if (ok) { setCopied(text); setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500); } }); };
    return (
      <div className="cmd">
        <pre aria-label={label}>{text}</pre>
        <button className="btn" onClick={copy}>{copied === text ? "コピーしました" : "コピー"}</button>
      </div>
    );
  };
  if (!isElectron) {
    return (
      <>
        <h2>書き出し</h2>
        <p>ブラウザ版では pptx を直接書き出せません。「書き出す」で deck.json を保存したあと、Python と python-pptx が入った環境で次を実行します。</p>
        {command("書き出しのコマンド", ["python3 tools/export_pptx.py deck.json --master master.pptx -o out/deck.pptx --assets ."])}
      </>
    );
  }
  const status = !check ? (checking ? "確認中" : "未確認")
    : check.ok ? `使えます。python-pptx ${check.pptx}、Python ${check.version}`
    : check.problem === "no-pptx" ? `python-pptx が入っていません。Python ${check.version} は見つかりました`
    : check.problem === "needs-clt" ? "Python を使うには Command Line Tools が必要です"
    : "Python が見つかりません";
  const needsPython = check?.problem === "no-python" || check?.problem === "needs-clt";
  return (
    <>
      <h2>書き出し</h2>
      <p>「書き出す」は、アプリに入っている変換スクリプトを Python で動かして pptx を作ります。Python と python-pptx はアプリに含まれていないので、この Mac に入っている必要があります。起動時にも確認し、使えなければ知らせます。</p>
      <div className="settings-row">
        <div className="settings-label">状態</div>
        <div className="flex items-center gap-3">
          <span style={{ color: check && !check.ok ? "var(--warn)" : "var(--ink)" }}>{status}</span>
          <button className="btn" onClick={() => void run()} disabled={checking}>{checking ? "確認中" : "再確認"}</button>
        </div>
        {check?.python && <div className="settings-hint">{check.python}</div>}
      </div>
      <label className="settings-row">
        <div className="settings-label">Python の場所</div>
        <input className="settings-input mono" aria-label="Python の場所" placeholder="空欄なら自動で探す" value={configured ?? ""}
          onChange={(e) => settings.update((v) => { v.export.python = e.target.value.trim() || null; })} />
        <div className="settings-hint">空欄なら、mdslide 専用の環境、PATH、Homebrew などの順に探します。変えたら「再確認」を押します。</div>
      </label>
      {check && !check.ok && (
        <section className="settings-install" aria-label="入れ方">
          <h3>入れ方</h3>
          {needsPython && (
            <>
              <p>1. Python を入れます。Apple の Command Line Tools に Python 3 が含まれています。ターミナルで次を実行し、表示に従います。</p>
              {command("Command Line Tools のコマンド", [cmds.tools])}
            </>
          )}
          <p>{needsPython ? "2. " : ""}mdslide 専用の環境を作り、python-pptx を入れます。ターミナルに貼り付けて実行し、終わったら「再確認」を押します。アプリはこの場所を最初に探します。</p>
          {command("専用の環境に入れるコマンド", cmds.venv)}
          <p className="settings-hint">今ある python3 にそのまま入れる場合は、次のコマンドでも構いません。</p>
          {command("今の python3 に入れるコマンド", [cmds.user])}
        </section>
      )}
    </>
  );
}

/** The CLI tools the console can launch. Presets can be edited and restored, custom ones removed. */
function ToolsTab() {
  const tools = useToolsStore((s) => s.tools);
  const selectedId = useToolsStore((s) => s.selectedId);
  const { select, add, update, remove, restoreDefaults } = useToolsStore.getState();
  const autoStart = useTerminalStore((s) => s.autoStart);
  const setAutoStart = useTerminalStore((s) => s.setAutoStart);
  const [draft, setDraft] = useState({ name: "", command: "", args: "" });
  const submit = () => { if (add(draft) !== null) setDraft({ name: "", command: "", args: "" }); };
  return (
    <>
      <h2>CLI ツール</h2>
      <p>コンソールで起動するコマンドです。プリセットは PATH が通っている前提。選択したものが、コンソールバーの「起動」と自動起動の対象になります。</p>
      <label className="settings-row">
        <div className="settings-label">自動起動</div>
        <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} aria-label="自動起動" />
        <div className="settings-hint">シェルが立ち上がったら、選択中のツールを実行する</div>
      </label>
      <table className="tools-table mt-3">
        <thead><tr><th></th><th>名前</th><th>コマンド</th><th>引数</th><th></th></tr></thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.id} className={t.id === selectedId ? "on" : ""}>
              <td><input type="radio" name="tool" aria-label={`${t.name} を選択`} checked={t.id === selectedId} onChange={() => select(t.id)} /></td>
              <td><input aria-label={`${t.name} の名前`} value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} /></td>
              <td><input aria-label={`${t.name} のコマンド`} className="mono" value={t.command} onChange={(e) => update(t.id, { command: e.target.value })} /></td>
              <td><input aria-label={`${t.name} の引数`} className="mono" value={t.args} onChange={(e) => update(t.id, { args: e.target.value })} placeholder="任意" /></td>
              <td>{isPreset(t.id) ? <span className="preset">プリセット</span> : <button className="link" onClick={() => remove(t.id)} aria-label={`${t.name} を削除`}>削除</button>}</td>
            </tr>
          ))}
          <tr className="draft">
            <td></td>
            <td><input aria-label="新しいツールの名前" placeholder="名前" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
            <td><input aria-label="新しいツールのコマンド" className="mono" placeholder="command" value={draft.command} onChange={(e) => setDraft({ ...draft, command: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} /></td>
            <td><input aria-label="新しいツールの引数" className="mono" placeholder="--flag" value={draft.args} onChange={(e) => setDraft({ ...draft, args: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} /></td>
            <td><button className="btn" onClick={submit} disabled={!draft.command.trim()}>追加</button></td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3"><button className="link" onClick={restoreDefaults}>プリセットを既定に戻す</button></div>
    </>
  );
}
