import React, { useEffect, useRef, useState } from "react";
import { ThumbnailPane } from "./ThumbnailPane";
import { PreviewPane } from "./PreviewPane";
import { EditorPane } from "./EditorPane";
import { SettingsHost, useSettingsSheet } from "./SettingsSheet";
import { TerminalPane } from "./TerminalPane";
import { InboxDrawer } from "./InboxDrawer";
import { useInboxStore } from "../console/inboxStore";
import { HelpSheet } from "./HelpSheet";
import { StartScreen } from "./StartScreen";
import { Icon } from "./Icon";
import { settings } from "../settings/settings";
import { applyTheme } from "../settings/appearance";
import { useTerminalStore } from "../console/terminalStore";
import { useCurrentMaster, useDeckStore } from "../store/deckStore";
import { buildExport, download } from "../export/exportJson";
import { isElectron, OUTPUT_FILE, supportsWorkspace } from "../workspace/workspace";

/** Navigator (thumbnail) column: default and drag limits in px. The splitter columns are SPLIT px wide. */
const NAV_DEFAULT = 232, NAV_MIN = 140, NAV_MAX = 520, SPLIT = 6;

export function App() {
  const [showHelp, setShowHelp] = useState(false);
  const openSettings = useSettingsSheet((s) => s.open);
  const [ready, setReady] = useState(settings.loaded);
  const inboxOpen = useInboxStore((s) => s.open);
  const toggleInbox = useInboxStore((s) => s.toggle);
  const dropFiles = useInboxStore((s) => s.dropFiles);
  const consoleOpen = useTerminalStore((s) => s.open);
  const toggleConsole = useTerminalStore((s) => s.toggle);
  const consoleHeight = useTerminalStore((s) => s.height);
  const setConsoleHeight = useTerminalStore((s) => s.setHeight);
  const closeHelp = () => { settings.update((v) => { v.help.seen = true; }); setShowHelp(false); };

  // Global shortcuts: ⌘J console, ⌘/ help, ⌘, settings. The Electron app menu reaches the same two sheets by IPC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "j" || e.key === "J") { e.preventDefault(); toggleConsole(); }
      if (e.key === "/") { e.preventDefault(); setShowHelp((v) => !v); }
      if (e.key === ",") { e.preventDefault(); openSettings(); }
    };
    window.addEventListener("keydown", onKey);
    const offSettings = window.mdslide?.onOpenSettings?.(() => openSettings());
    const offHelp = window.mdslide?.onOpenHelp?.(() => setShowHelp(true));
    return () => { window.removeEventListener("keydown", onKey); offSettings?.(); offHelp?.(); };
  }, [toggleConsole, openSettings]);

  const startResize = (e: React.MouseEvent) => {
    const startY = e.clientY, startH = consoleHeight;
    const move = (ev: MouseEvent) => setConsoleHeight(Math.min(700, Math.max(140, startH + (startY - ev.clientY))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  // Pane widths: dragged on the vertical splitters, kept in settings (null = the defaults: 232px navigator, 42% editor).
  const [editorWidth, setEditorWidth] = useState<number | null>(() => settings.get().editor.width);
  const [navWidth, setNavWidth] = useState<number | null>(() => settings.get().navigator.width);
  useEffect(() => settings.subscribe((s) => { setEditorWidth(s.editor.width); setNavWidth(s.navigator.width); }), []);
  const gridRef = useRef<HTMLDivElement>(null);
  const navPx = navWidth ?? NAV_DEFAULT;
  /** Track the mouse from `start`; `sign` says which way a rightward drag grows the pane. The width is saved on release. */
  const drag = (e: React.MouseEvent, start: number, sign: 1 | -1, clamp: (w: number) => number, apply: (w: number) => void, commit: (w: number) => void) => {
    e.preventDefault();
    const startX = e.clientX;
    let last = start;
    const move = (ev: MouseEvent) => { last = clamp(start + sign * (ev.clientX - startX)); apply(last); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); commit(last); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const startEditorResize = (e: React.MouseEvent) => {
    const startW = editorWidth ?? (gridRef.current?.querySelector<HTMLElement>(".editor")?.getBoundingClientRect().width || 480);
    const gridW = gridRef.current?.getBoundingClientRect().width ?? 0;
    const maxW = gridW ? gridW - navPx - SPLIT * 2 - (inboxOpen ? 300 : 0) - 360 : Infinity; // keep the preview at least 360px
    drag(e, startW, -1, (w) => Math.max(320, Math.min(maxW, w)), setEditorWidth, (w) => settings.update((v) => { v.editor.width = w; }));
  };
  const startNavResize = (e: React.MouseEvent) => {
    const gridW = gridRef.current?.getBoundingClientRect().width ?? 0;
    const editorMin = editorWidth ?? (inboxOpen ? 340 : 360); // a flexible editor can shrink this far
    const maxW = gridW ? Math.min(NAV_MAX, gridW - SPLIT * 2 - (inboxOpen ? 300 : 0) - editorMin - 360) : NAV_MAX; // keep the preview at least 360px
    drag(e, navPx, 1, (w) => Math.max(NAV_MIN, Math.min(maxW, w)), setNavWidth, (w) => settings.update((v) => { v.navigator.width = w; }));
  };
  const editorCol = editorWidth ? `${editorWidth}px` : inboxOpen ? "minmax(340px,38%)" : "minmax(360px,42%)";
  // The preview never collapses below 360px: a flexible editor gives way first.
  const gridColumns = `${navPx}px ${SPLIT}px minmax(360px,1fr) ${SPLIT}px ${editorCol}${inboxOpen ? " 300px" : ""}`;
  const refresh = useDeckStore((s) => s.refreshMasters);
  const master = useCurrentMaster();
  const masters = useDeckStore((s) => s.masters);
  const setMaster = useDeckStore((s) => s.setMaster);
  const deck = useDeckStore((s) => s.deck);
  const openRef = useRef<HTMLInputElement>(null);
  const workspace = useDeckStore((s) => s.workspace);
  const started = useDeckStore((s) => s.started);
  const dirty = useDeckStore((s) => s.dirty);
  const saveState = useDeckStore((s) => s.saveState);
  const externalChange = useDeckStore((s) => s.externalChange);
  const openWorkspace = useDeckStore((s) => s.openWorkspace);
  const openMarkdownFile = useDeckStore((s) => s.openMarkdown);
  const restoreWorkspace = useDeckStore((s) => s.restoreWorkspace);
  const loadFromDisk = useDeckStore((s) => s.loadFromDisk);
  const save = useDeckStore((s) => s.save);
  const pollDisk = useDeckStore((s) => s.pollDisk);
  const runExport = useDeckStore((s) => s.runExport);
  const onFileChanged = useDeckStore((s) => s.onFileChanged);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const notice = useDeckStore((s) => s.notice);
  const setNotice = useDeckStore((s) => s.setNotice);
  const masterMissing = useDeckStore((s) => s.masterMissing);
  const [exporting, setExporting] = useState(false);

  // Settings first (they hold the last folder and the help flag), then masters, then the folder.
  useEffect(() => {
    const offTheme = settings.subscribe((s) => applyTheme(s.appearance.theme)); // subscribed before load(), which notifies
    settings.load().then(() => { setReady(true); setShowHelp(!settings.get().help.seen); return refresh(); }).then(() => restoreWorkspace());
    // Manual edits to settings.json are picked up when the window regains focus.
    const onFocus = () => { void settings.load(); };
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("focus", onFocus); offTheme(); };
  }, [refresh, restoreWorkspace]);
  // Viewer mode: pick up deck.md rewritten by Claude Code or another editor.
  useEffect(() => {
    if (!workspace) return;
    if (workspace.backend.watch) {
      let off: (() => void) | undefined;
      workspace.backend.watch(onFileChanged).then((f) => { off = f; });
      return () => off?.();
    }
    const t = setInterval(() => { void pollDisk(); }, 2000);
    return () => clearInterval(t);
  }, [workspace, pollDisk, onFileChanged]);

  const exportJson = async () => {
    const { deck, slides, exportDeckJson, imageDims } = useDeckStore.getState();
    const data = buildExport(deck, slides, master, imageDims);
    const json = JSON.stringify(data, null, 2);
    if ((await exportDeckJson(json)) === "written") {
      if (isElectron) {
        setExporting(true);
        const r = await runExport();
        setExporting(false);
        setExportNote(r.message);
        if (r.ok) void workspace?.backend.showItem?.(OUTPUT_FILE);
      } else {
        setExportNote(`deck.json を書き出しました。 python3 tools/export_pptx.py deck.json --master master.pptx -o out/deck.pptx --assets . を ${workspace?.name} で実行してください。`);
      }
    } else {
      download(`${deck.meta.title || "deck"}.json`, json);
    }
  };
  const exportMarkdown = () => download(`${deck.meta.title || "deck"}.md`, useDeckStore.getState().markdown, "text/markdown");
  // Browsers without the File System Access API: load the text only (no folder, nothing is saved back).
  const loadMarkdownText = (file: File) => file.text().then((t) => {
    useDeckStore.setState({ externalEditVersion: useDeckStore.getState().externalEditVersion + 1, started: true });
    useDeckStore.getState().setMarkdown(t);
  });

  const mac = isElectron && window.mdslide?.platform === "darwin";
  useEffect(() => { if (isElectron) document.body.classList.add("electron"); }, []);

  // Files dropped anywhere but the editor (which handles images itself) go to notes/.
  const onWindowDrop = (e: React.DragEvent) => {
    if ((e.target as HTMLElement).closest(".cm-editor, .inbox")) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length || !workspace) return;
    e.preventDefault();
    void dropFiles(workspace.backend, files).then((saved) => { if (saved.length) { useInboxStore.setState({ open: true }); } });
  };

  if (!ready) return <div className="h-full" />;
  const deckFile = workspace?.deckFile ?? "deck.md";
  if (!started && !workspace) {
    return (
      <div className="h-full flex flex-col">
        <header className="toolbar" style={{ paddingLeft: mac ? 84 : 14 }}>
          <span className="title">mdslide</span>
          <div className="spacer" />
          <button className="btn icon" onClick={() => setShowHelp(true)} title="使い方 (⌘/)" aria-label="使い方"><Icon name="help" /></button>
          <button className="btn icon" onClick={() => openSettings()} title="設定 (⌘,)" aria-label="設定"><Icon name="gear" /></button>
        </header>
        {notice && (
          <div className="banner warn">
            <span className="truncate">{notice}</span>
            <button className="link shrink-0" onClick={() => setNotice(null)}>閉じる</button>
          </div>
        )}
        <StartScreen />
        <SettingsHost />
        {showHelp && <HelpSheet onClose={closeHelp} />}
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col" onDragOver={(e) => { if (!(e.target as HTMLElement).closest(".cm-editor")) e.preventDefault(); }} onDrop={onWindowDrop}>
      <header className="toolbar" style={{ paddingLeft: mac ? 84 : 14 }}>
        <span className="title">mdslide</span>
        <div className="spacer" />
        {supportsWorkspace ? (
          <>
            <button className="btn with-icon" onClick={() => (isElectron ? openMarkdownFile() : openWorkspace()).catch(() => undefined)}
              title={isElectron ? "Markdown ファイルを開く" : "フォルダを開く"}>
              <Icon name={workspace ? "doc" : "folder"} />
              {workspace ? `${workspace.name}/${workspace.deckFile}` : isElectron ? "開く" : "フォルダを開く"}
            </button>
            {workspace && (
              <button className={`btn quiet ${dirty ? "dirty" : ""}`} onClick={() => save(true)} title="保存 (⌘S)">
                {saveState === "saving" ? "保存中" : dirty ? "未保存" : "保存済み"}
              </button>
            )}
          </>
        ) : (
          <>
            <input ref={openRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && loadMarkdownText(e.target.files[0])} />
            <button className="btn with-icon" onClick={() => openRef.current?.click()}><Icon name="doc" />開く</button>
            <button className="btn" onClick={exportMarkdown}>保存</button>
          </>
        )}
        <span className="toolbar-sep" />
        <select className="select" value={master?.id ?? ""} onChange={(e) => setMaster(e.target.value || null)} aria-label="マスター" title="この資料のマスター（frontmatter の master: に書かれる）">
          <option value="">マスターなし</option>
          {masters.map((m) => <option key={m.id} value={m.id}>{m.id.startsWith("ws:") ? "このフォルダの master.pptx" : m.name}</option>)}
        </select>
        <button className="btn icon" onClick={() => openSettings("master")} aria-label="マスター" title="スライドマスターの取り込みと管理（設定）"><Icon name="master" /></button>
        <span className="toolbar-sep" />
        <button className={`btn icon ${inboxOpen ? "on" : ""}`} onClick={toggleInbox} title="下書き (⌘I)" aria-label="下書き" aria-pressed={inboxOpen}><Icon name="note" /></button>
        <button className={`btn icon ${consoleOpen ? "on" : ""}`} onClick={toggleConsole} title="コンソール (⌘J)" aria-label="コンソール" aria-pressed={consoleOpen}><Icon name="terminal" /></button>
        <button className="btn icon" onClick={() => setShowHelp(true)} title="使い方 (⌘/)" aria-label="使い方"><Icon name="help" /></button>
        <button className="btn icon" onClick={() => openSettings()} title="設定 (⌘,)" aria-label="設定"><Icon name="gear" /></button>
        <span className="toolbar-sep" />
        <button className="btn primary with-icon" disabled={exporting} onClick={exportJson}
          title={isElectron ? "deck.json を書き出し、master.pptx を母体に out/deck.pptx を生成" : "deck.json を書き出し、tools/export_pptx.py で pptx を生成"}>
          <Icon name="export" />{exporting ? "生成中" : "書き出す"}
        </button>
      </header>
      {externalChange && (
        <div className="banner warn">
          <span>{deckFile} がフォルダ側で変更されました。未保存の編集があります。</span>
          <button className="link" onClick={() => loadFromDisk()}>フォルダの内容を読み込む</button>
          <button className="link" onClick={() => save(true)}>こちらで上書き</button>
        </div>
      )}
      {notice && (
        <div className="banner warn">
          <span className="truncate">{notice}</span>
          <button className="link shrink-0" onClick={() => setNotice(null)}>閉じる</button>
        </div>
      )}
      {exportNote && (
        <div className="banner info">
          <span className="truncate">{exportNote}</span>
          <button className="link shrink-0" onClick={() => setExportNote(null)}>閉じる</button>
        </div>
      )}
      {masterMissing && (
        <div className="banner warn">
          <span>frontmatter の master: {masterMissing} が保管フォルダにありません。「マスター」から取り込むか、選び直してください。</span>
        </div>
      )}
      {!master && !masterMissing && (
        <div className="banner warn">
          <span>スライドマスターが未設定です。「マスター」から保管フォルダの pptx を選ぶ{workspace ? "か、フォルダに master.pptx を置いて" : ""}ください。</span>
        </div>
      )}
      {!workspace && supportsWorkspace && (
        <div className="banner info">
          <span>フォルダを開くと、画像の貼り付けと自動保存が有効になります。</span>
        </div>
      )}
      <div ref={gridRef} className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: gridColumns }}>
        <aside className="navigator min-h-0"><ThumbnailPane /></aside>
        <div className="vsplitter min-h-0" onMouseDown={startNavResize} role="separator" aria-orientation="vertical" aria-label="サムネイルの幅" title="ドラッグでサムネイルの幅を変更" />
        <main className="stage min-h-0 flex flex-col">
          <div className="flex-1 min-h-0"><PreviewPane /></div>
          {consoleOpen && (
            <>
              <div className="splitter" onMouseDown={startResize} role="separator" aria-orientation="horizontal" aria-label="コンソールの高さ" />
              <div style={{ height: consoleHeight }} className="shrink-0 min-h-0"><TerminalPane /></div>
            </>
          )}
        </main>
        <div className="vsplitter min-h-0" onMouseDown={startEditorResize} role="separator" aria-orientation="vertical" aria-label="エディタの幅" title="ドラッグでエディタの幅を変更" />
        <section className="editor min-h-0"><EditorPane /></section>
        {inboxOpen && <InboxDrawer />}
      </div>
      <SettingsHost />
      {showHelp && <HelpSheet onClose={closeHelp} />}
    </div>
  );
}
