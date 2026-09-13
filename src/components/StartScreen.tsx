import { useEffect, useState } from "react";
import { settings } from "../settings/settings";
import { useDeckStore } from "../store/deckStore";
import { isElectron, supportsWorkspace, type RecentEntry } from "../workspace/workspace";
import { Icon } from "./Icon";

/**
 * What the app shows until a document is open: the ways in, and the recent list.
 * Nothing is created or shown until the person chooses, so the file being edited is never a mystery.
 */
export function StartScreen() {
  const openMarkdown = useDeckStore((s) => s.openMarkdown);
  const createMarkdown = useDeckStore((s) => s.createMarkdown);
  const openWorkspace = useDeckStore((s) => s.openWorkspace);
  const openRecent = useDeckStore((s) => s.openRecent);
  const viewSample = useDeckStore((s) => s.viewSample);
  const [recent, setRecent] = useState<RecentEntry[]>(() => settings.get().workspace.recent);
  useEffect(() => settings.subscribe((s) => setRecent(s.workspace.recent)), []);
  const run = (p: Promise<void>) => { void p.catch(() => undefined); };

  return (
    <div className="start">
      <div className="start-card">
        <h1>mdslide</h1>
        <p className="start-lead">Markdown を書くとスライドになります。資料は「Markdown ファイル」と、同じフォルダの <code>images/</code>（貼り付けた画像）、<code>master.pptx</code>（書式）の単位で扱います。</p>
        <div className="start-actions">
          {isElectron && <button className="btn primary with-icon" onClick={() => run(openMarkdown())}><Icon name="doc" />Markdown を開く</button>}
          {isElectron && <button className="btn with-icon" onClick={() => run(createMarkdown())}><Icon name="plus" />新しく作る</button>}
          {supportsWorkspace && <button className="btn with-icon" onClick={() => run(openWorkspace())}><Icon name="folder" />フォルダを開く</button>}
          <button className="btn quiet" onClick={viewSample}>サンプルを見る</button>
        </div>
        {isElectron && recent.length > 0 && (
          <section className="start-recent" aria-label="最近開いたもの">
            <h2>最近開いたもの</h2>
            <ul>
              {recent.map((r) => (
                <li key={`${r.path}/${r.deckFile}`}>
                  <button className="link" onClick={() => run(openRecent(r))}>{r.deckFile}</button>
                  <span className="start-path" title={r.path}>{r.path}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="start-hint">{isElectron && <>「新しく作る」は資料のフォルダを選ぶ（その場で作れます）と、その中に <code>deck.md</code> を表紙・章・スライド 1 枚だけの空の枠で作ります。</>}フォルダを開いた場合は、その中の <code>deck.md</code>（無ければ見本から作成）を使います。</p>
      </div>
    </div>
  );
}
