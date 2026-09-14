import { useEffect, useId, useState, type ReactNode } from "react";
import { settings } from "../settings/settings";
import { useDeckStore } from "../store/deckStore";
import { isElectron, supportsWorkspace, type RecentEntry } from "../workspace/workspace";
import { Icon, type IconName } from "./Icon";

/**
 * What the app shows until a document is open: two ways in (create a deck, open one), the recent list, and the sample.
 * Nothing is created or shown until the person chooses, so the file being edited is never a mystery. ADR-0029.
 */
export function StartScreen() {
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
        <p className="start-lead">Markdown を書くとスライドになります。資料ごとに 1 つのフォルダを使います。</p>
        <div className="start-actions">
          {isElectron && (
            <StartAction primary icon="plus" title="新しい資料を作る" onClick={() => run(createMarkdown())}
              detail={<>フォルダを選ぶと、中に <code>deck.md</code> と <code>images/</code> を用意します</>} />
          )}
          {isElectron && (
            <StartAction icon="folder" title="資料を開く" onClick={() => run(openWorkspace())}
              detail="資料のフォルダか、その中の Markdown ファイルを選びます" />
          )}
          {!isElectron && supportsWorkspace && (
            <StartAction primary icon="folder" title="フォルダを開く" onClick={() => run(openWorkspace())}
              detail={<>資料のフォルダを選びます。<code>deck.md</code> が無ければ空の枠を作ります</>} />
          )}
        </div>
        {isElectron && recent.length > 0 && (
          <section className="start-recent" aria-label="最近開いたもの">
            <h2>最近開いたもの</h2>
            <ul>
              {recent.map((r) => {
                const { folder, parent } = splitPath(r.path);
                return (
                  <li key={`${r.path}/${r.deckFile}`}>
                    <button className="link" onClick={() => run(openRecent(r))}>{`${folder}/${r.deckFile}`}</button>
                    {/* bdi keeps the path left-to-right inside the rtl box that shows its end when it is too long. */}
                    <span className="start-path" title={r.path}><bdi>{parent}</bdi></span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <div className="start-foot">
          <button className="btn quiet" onClick={viewSample}>サンプルを見る</button>
        </div>
      </div>
    </div>
  );
}

/** A large choice: icon, the title that names the button, and one line on what happens. */
function StartAction({ icon, title, detail, primary = false, onClick }: { icon: IconName; title: string; detail: ReactNode; primary?: boolean; onClick: () => void }) {
  const id = useId();
  return (
    <button className={`btn start-action${primary ? " primary" : ""}`} onClick={onClick} aria-labelledby={`${id}t`} aria-describedby={`${id}d`}>
      <Icon name={icon} size={20} />
      <span className="start-action-text">
        <span id={`${id}t`} className="start-action-title">{title}</span>
        <span id={`${id}d`} className="start-action-detail">{detail}</span>
      </span>
    </button>
  );
}

/** "/Users/me/資料/四半期報告" -> the folder name, as the toolbar shows it, and where the folder is. */
function splitPath(p: string): { folder: string; parent: string } {
  const i = p.lastIndexOf("/");
  return { folder: p.slice(i + 1), parent: p.slice(0, i) || "/" };
}
