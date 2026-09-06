import React, { useEffect, useRef, useState } from "react";
import { ThumbnailPane } from "./ThumbnailPane";
import { PreviewPane } from "./PreviewPane";
import { EditorPane } from "./EditorPane";
import { MasterDialog } from "./MasterDialog";
import { TerminalPane } from "./TerminalPane";
import { InboxDrawer } from "./InboxDrawer";
import { useInboxStore } from "../console/inboxStore";
import { HelpSheet } from "./HelpSheet";
import { StartScreen } from "./StartScreen";
import { settings } from "../settings/settings";
import { useTerminalStore } from "../console/terminalStore";
import { useCurrentMaster, useDeckStore } from "../store/deckStore";
import { buildExport, download } from "../export/exportJson";
import { isElectron, OUTPUT_FILE, supportsWorkspace } from "../workspace/workspace";

export function App() {
  const [showMaster, setShowMaster] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [ready, setReady] = useState(settings.loaded);
  const inboxOpen = useInboxStore((s) => s.open);
  const toggleInbox = useInboxStore((s) => s.toggle);
  const dropFiles = useInboxStore((s) => s.dropFiles);
  const consoleOpen = useTerminalStore((s) => s.open);
  const toggleConsole = useTerminalStore((s) => s.toggle);
  const consoleHeight = useTerminalStore((s) => s.height);
  const setConsoleHeight = useTerminalStore((s) => s.setHeight);
  const closeHelp = () => { settings.update((v) => { v.help.seen = true; }); setShowHelp(false); };

  // Global shortcuts: ⌘J console, ⌘/ help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "j" || e.key === "J") { e.preventDefault(); toggleConsole(); }
      if (e.key === "/") { e.preventDefault(); setShowHelp((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleConsole]);

  const startResize = (e: React.MouseEvent) => {
    const startY = e.clientY, startH = consoleHeight;
    const move = (ev: MouseEvent) => setConsoleHeight(Math.min(700, Math.max(140, startH + (startY - ev.clientY))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  // Editor pane width: dragged on the vertical splitter, kept in settings (null = the default 42%).
  const [editorWidth, setEditorWidth] = useState<number | null>(() => settings.get().editor.width);
  useEffect(() => settings.subscribe((s) => setEditorWidth(s.editor.width)), []);
  const gridRef = useRef<HTMLDivElement>(null);
  const startEditorResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = editorWidth ?? (gridRef.current?.querySelector<HTMLElement>(".editor")?.getBoundingClientRect().width || 480);
    const gridW = gridRef.current?.getBoundingClientRect().width ?? 0;
    const maxW = gridW ? gridW - 232 - 6 - (inboxOpen ? 300 : 0) - 360 : Infinity; // keep the preview at least 360px
    const clamp = (w: number) => Math.max(320, Math.min(maxW, w));
    let last = startW;
    const move = (ev: MouseEvent) => { last = clamp(startW + (startX - ev.clientX)); setEditorWidth(last); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); settings.update((v) => { v.editor.width = last; }); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const editorCol = editorWidth ? `${editorWidth}px` : inboxOpen ? "minmax(340px,38%)" : "minmax(360px,42%)";
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
    settings.load().then(() => { setReady(true); setShowHelp(!settings.get().help.seen); return refresh(); }).then(() => restoreWorkspace());
    // Manual edits to settings.json are picked up when the window regains focus.
    const onFocus = () => { void settings.load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
          <button className="btn quiet" onClick={() => setShowHelp(true)} title="使い方 (⌘/)" aria-label="使い方">?</button>
        </header>
        {notice && (
          <div className="banner warn">
            <span className="truncate">{notice}</span>
            <button className="link shrink-0" onClick={() => setNotice(null)}>閉じる</button>
          </div>
        )}
        <StartScreen />
        {showHelp && <HelpSheet onClose={closeHelp} />}
      </div>
    );
  }
  return (
    <div className="h-full flex flex-col" onDragOver={(e) => { if (!(e.target as HTMLElement).closest(".cm-editor")) e.preventDefault(); }} onDrop={onWindowDrop}>
      <header className="toolbar" style={{ paddingLeft: mac ? 84 : 14 }}>
        <span className="title">mdslide</span>
        <span className="subtitle truncate">{deck.meta.title || "無題"}</span>
        <div className="spacer" />
        {supportsWorkspace ? (
          <>
            <button className="btn" onClick={() => (isElectron ? openMarkdownFile() : openWorkspace()).catch(() => undefined)}
              title={isElectron ? "Markdown ファイルを開く" : "フォルダを開く"}>
              {workspace ? `${workspace.name}/${workspace.deckFile}` : isElectron ? "開く" : "フォルダを開く"}
            </button>
            {workspace && (
              <button className={`btn quiet ${dirty ? "dirty" : ""}`} onClick={() => save(true)}>
                {saveState === "saving" ? "保存中" : dirty ? "未保存" : "保存済み"}
              </button>
            )}
          </>
        ) : (
          <>
            <input ref={openRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && loadMarkdownText(e.target.files[0])} />
            <button className="btn" onClick={() => openRef.current?.click()}>開く</button>
            <button className="btn" onClick={exportMarkdown}>保存</button>
          </>
        )}
        <select className="select" value={master?.id ?? ""} onChange={(e) => setMaster(e.target.value || null)} aria-label="マスター" title="この資料のマスター（frontmatter の master: に書かれる）">
          <option value="">マスターなし</option>
          {masters.map((m) => <option key={m.id} value={m.id}>{m.id.startsWith("ws:") ? "このフォルダの master.pptx" : m.name}</option>)}
        </select>
        <button className="btn" onClick={() => setShowMaster(true)}>マスター</button>
        <button className="btn quiet" onClick={toggleInbox} title="下書き (⌘I)" aria-pressed={inboxOpen}>下書き</button>
        <button className="btn quiet" onClick={toggleConsole} title="コンソール (⌘J)" aria-pressed={consoleOpen}>コンソール</button>
        <button className="btn quiet" onClick={() => setShowHelp(true)} title="使い方 (⌘/)" aria-label="使い方">?</button>
        <button className="btn primary" disabled={exporting} onClick={exportJson}
          title={isElectron ? "deck.json を書き出し、master.pptx を母体に out/deck.pptx を生成" : "deck.json を書き出し、tools/export_pptx.py で pptx を生成"}>
          {exporting ? "生成中" : isElectron && workspace ? "書き出す" : "書き出す"}
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
      <div ref={gridRef} className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: inboxOpen ? `220px minmax(0,1fr) 6px ${editorCol} 300px` : `232px minmax(0,1fr) 6px ${editorCol}` }}>
        <aside className="navigator min-h-0"><ThumbnailPane /></aside>
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
      {showMaster && <MasterDialog onClose={() => setShowMaster(false)} />}
      {showHelp && <HelpSheet onClose={closeHelp} />}
    </div>
  );
}
