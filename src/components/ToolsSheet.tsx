import { useState } from "react";
import { useEffect } from "react";
import { isPreset, useToolsStore } from "../console/toolsStore";
import { settings } from "../settings/settings";

/** Edit the CLI tools that can be launched from the console. Presets can be edited and restored, custom ones removed. */
export function ToolsSheet({ onClose }: { onClose: () => void }) {
  const tools = useToolsStore((s) => s.tools);
  const selectedId = useToolsStore((s) => s.selectedId);
  const { select, add, update, remove, restoreDefaults } = useToolsStore.getState();
  const [draft, setDraft] = useState({ name: "", command: "", args: "" });
  const [filePath, setFilePath] = useState<string | null>(null);
  const [vim, setVim] = useState(settings.get().editor.vim);
  useEffect(() => { if (window.mdslide) window.mdslide.settingsPath().then(setFilePath); }, []);
  useEffect(() => settings.subscribe((s) => setVim(s.editor.vim)), []);

  const submit = () => { if (add(draft) !== null) setDraft({ name: "", command: "", args: "" }); };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet tools" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="設定">
        <h2>エディタ</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={vim} onChange={(e) => settings.update((v) => { v.editor.vim = e.target.checked; })} aria-label="Vim キーバインド" />
          <span>Vim キーバインド</span>
          <span className="preset">オフにすると通常のテキスト編集（矢印キー・Shift 選択・⌘S 保存）</span>
        </label>
        <h2 className="mt-5">CLI ツール</h2>
        <p>コンソールで起動するコマンドです。プリセットは PATH が通っている前提。選択したものが「起動時に自動実行」の対象になります。</p>
        <table className="tools-table">
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
        <div className="mt-4 flex items-center gap-3">
          <button className="link" onClick={restoreDefaults}>プリセットを既定に戻す</button>
          <span className="flex-1" />
          {filePath
            ? <button className="link" title={filePath} onClick={() => { void settings.flush().then(() => window.mdslide?.openPath(filePath)); }}>settings.json を開く</button>
            : <span className="preset">設定は {settings.backend.path} に保存</span>}
          <button className="btn primary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
