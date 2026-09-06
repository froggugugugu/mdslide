import { useEffect, useRef, useState } from "react";
import { attachInboxFs, isTextNote, useInboxStore } from "../console/inboxStore";
import { PROMPTS, buildPrompt } from "../console/prompts";
import { useTerminalStore } from "../console/terminalStore";
import { useToolsStore } from "../console/toolsStore";
import { useDeckStore } from "../store/deckStore";
import { slideRef } from "../model/refs";
import { restoreLatestSnapshot, snapshotDeck } from "../workspace/history";
import { Icon } from "./Icon";

/**
 * Raw material in, instructions out. Text typed here is saved to notes/ as you go; dropped files land in notes/ too.
 * The action buttons snapshot deck.md and type a fixed prompt into the console where the CLI agent is running.
 */
export function InboxDrawer() {
  const open = useInboxStore((s) => s.open);
  const toggle = useInboxStore((s) => s.toggle);
  const notes = useInboxStore((s) => s.notes);
  const draft = useInboxStore((s) => s.draft);
  const draftFile = useInboxStore((s) => s.draftFile);
  const saving = useInboxStore((s) => s.saving);
  const setDraft = useInboxStore((s) => s.setDraft);
  const flush = useInboxStore((s) => s.flush);
  const newDraft = useInboxStore((s) => s.newDraft);
  const refresh = useInboxStore((s) => s.refresh);
  const remove = useInboxStore((s) => s.remove);
  const openNote = useInboxStore((s) => s.openNote);
  const dropFiles = useInboxStore((s) => s.dropFiles);
  const workspace = useDeckStore((s) => s.workspace);
  const slides = useDeckStore((s) => s.slides);
  const selectedId = useDeckStore((s) => s.selectedId);
  const setNotice = useDeckStore((s) => s.setNotice);
  const loadFromDisk = useDeckStore((s) => s.loadFromDisk);
  const termWrite = useTerminalStore((s) => s.write);
  const termRunning = useTerminalStore((s) => s.ptyId !== null);
  const tool = useToolsStore((s) => s.tools.find((t) => t.id === s.selectedId)?.name ?? "CLI");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fs = workspace?.backend ?? null;
  const deckFile = workspace?.deckFile ?? "deck.md";

  useEffect(() => { attachInboxFs(fs); if (fs) void refresh(fs); }, [fs, refresh]);
  useEffect(() => { setSelected((cur) => new Set([...cur].filter((n) => notes.includes(n)))); }, [notes]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) { e.preventDefault(); toggle(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const pick = (n: string) => setSelected((cur) => { const s = new Set(cur); if (s.has(n)) s.delete(n); else s.add(n); return s; });
  const chosenNotes = () => (selected.size ? [...selected] : notes.filter((n) => !n.endsWith(".keep")));
  const current = slides.find((s) => s.id === selectedId);

  const send = async (id: string) => {
    if (!fs || !workspace) return;
    if (!termRunning) { setNotice("コンソールでツールを起動してから実行してください。"); return; }
    setBusy(id);
    try {
      await flush(fs);
      await snapshotDeck(fs, undefined, deckFile);
      const text = buildPrompt(id, chosenNotes(), current ? slideRef(current, deckFile) : null, deckFile);
      await termWrite(text + "\r");
    } finally { setBusy(null); }
  };
  const undo = async () => {
    if (!fs) return;
    const restored = await restoreLatestSnapshot(fs, undefined, deckFile);
    if (!restored) { setNotice("戻せる版がありません。"); return; }
    await loadFromDisk();
    setNotice(`${deckFile} を ${restored.split("/").pop()} の内容に戻しました。もう一度押すと取り消せます。`);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (!fs) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) { await dropFiles(fs, files); return; }
    const text = e.dataTransfer.getData("text/plain");
    if (text) setDraft(draft ? `${draft}\n\n${text}` : text);
  };

  if (!open) return null;
  return (
    <aside className={`inbox ${dragOver ? "drag" : ""}`} data-testid="inbox" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
      <div className="inbox-bar">
        <span className="console-title">下書き</span>
        <span className="console-meta">{!fs ? "フォルダを開くと使えます" : saving ? "保存中" : draftFile ? draftFile.replace("notes/", "") : "notes/ に自動保存"}</span>
        <span className="flex-1" />
        <button className="btn icon" onClick={toggle} aria-label="下書きを閉じる" title="閉じる (⌘I)"><Icon name="close" /></button>
      </div>
      <textarea className="inbox-draft" aria-label="メモ" placeholder="話したいこと、説明したいことを口語のままつらつらと。ここに書いたものは notes/ に保存され、下のボタンで AI に渡せます。ファイルはこのペインにドロップ。"
        value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!fs} onBlur={() => fs && void flush(fs)} />
      <div className="inbox-row">
        <button className="btn quiet with-icon" onClick={() => { if (fs) void flush(fs).then(newDraft); }} disabled={!fs || !draft.trim()}><Icon name="plus" />新しいメモ</button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { if (fs && e.target.files) void dropFiles(fs, Array.from(e.target.files)); e.target.value = ""; }} />
        <button className="btn quiet with-icon" onClick={() => fileRef.current?.click()} disabled={!fs}><Icon name="clip" />ファイルを追加</button>
      </div>
      <div className="inbox-notes" aria-label="notes 一覧">
        {notes.filter((n) => !n.endsWith(".keep")).length === 0 && <div className="console-hint">まだ材料はありません。</div>}
        {notes.filter((n) => !n.endsWith(".keep")).map((n) => (
          <div key={n} className={`note ${selected.has(n) ? "on" : ""} ${draftFile === n ? "editing" : ""}`}>
            <span className="flex items-center gap-1 min-w-0">
              <input type="checkbox" checked={selected.has(n)} onChange={() => pick(n)} aria-label={`${n} を渡す`} />
              {isTextNote(n)
                ? <button className="name" onClick={() => fs && void openNote(fs, n)} aria-label={`${n} を開く`} title="上の編集エリアで確認・編集">{n.replace("notes/", "")}</button>
                : <code className="name" title="テキスト以外は開けません（AI には渡せます）">{n.replace("notes/", "")}</code>}
            </span>
            <button className="link" onClick={() => fs && void remove(fs, n)} aria-label={`${n} を削除`}>削除</button>
          </div>
        ))}
        <div className="console-hint">チェックしたものだけ渡します（未選択なら全部）。名前を押すと上で確認・編集できます。</div>
      </div>
      <div className="inbox-actions">
        <div className="seg-label" style={{ marginLeft: 0 }}>{tool} に頼む</div>
        {PROMPTS.map((p) => (
          <button key={p.id} className="btn" title={p.hint} disabled={!fs || busy !== null} onClick={() => send(p.id)}>{busy === p.id ? "送信中" : p.label.replace("deck.md", deckFile)}</button>
        ))}
        <button className="btn quiet with-icon" onClick={undo} disabled={!fs} title={`AI に渡す直前の ${deckFile} に戻す`}><Icon name="undo" />前の版に戻す</button>
        {!termRunning && fs && <div className="console-hint">コンソールでツールを起動すると送れます。</div>}
      </div>
    </aside>
  );
}
