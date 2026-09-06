import { useEffect, useRef, useState } from "react";
import { masterSource } from "../master/masterSource";
import { settings } from "../settings/settings";
import { useDeckStore } from "../store/deckStore";
import { isElectron } from "../workspace/workspace";

/**
 * The masters folder: what it holds, which file this deck uses (written into the frontmatter as `master:`),
 * and the default for decks that name none. The folder's own master.pptx, when present, is listed first.
 */
export function MasterDialog({ onClose }: { onClose: () => void }) {
  const masters = useDeckStore((s) => s.masters);
  const masterId = useDeckStore((s) => s.masterId);
  const masterErrors = useDeckStore((s) => s.masterErrors);
  const setMaster = useDeckStore((s) => s.setMaster);
  const refresh = useDeckStore((s) => s.refreshMasters);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [defaultName, setDefaultName] = useState<string | null>(settings.get().masters.default);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void masterSource.dir().then(setDir); }, []);
  useEffect(() => settings.subscribe((s) => setDefaultName(s.masters.default)), []);

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
      setMaster(`dir:${name}`);
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
  const layoutSummary = (m: typeof masters[number]) => (
    <>
      <div className="mt-2 text-[12px]" style={{ color: "var(--ink-2)" }}>{m.layouts.filter((l) => l.role).map((l) => l.name).join(" · ") || "対応レイアウトなし"}</div>
      {m.missing.length > 0 && <div className="mt-1 text-[12px]" style={{ color: "var(--warn)" }}>不足: {m.missing.join(", ")}</div>}
      {m.unmapped.length > 0 && <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>未使用: {m.unmapped.join(", ")}</div>}
    </>
  );

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>スライドマスター</h2>
        <p>レイアウト名を Cover / Agenda / Section / Body-Text / Body-2col と付けた pptx を保管フォルダに置き、資料ごとに選びます。選んだマスターは Markdown の frontmatter に <code>master:</code> として書かれます。書式・配色・ロゴはパワポ側で整えてください。</p>
        {isElectron && (
          <div className="master-dir">
            <span className="truncate" title={dir ?? ""}>保管フォルダ: {dir ?? "…"}</span>
            <button className="link" onClick={() => void changeDir()}>変更</button>
            <button className="link" onClick={() => void masterSource.reveal?.()}>Finder で表示</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".pptx,.potx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void add(f); e.target.value = ""; }} />
        <button className="btn primary" onClick={() => { if (isElectron) void add(); else fileRef.current?.click(); }} disabled={busy}>{busy ? "取り込み中" : "pptx を取り込む"}</button>
        {error && <p className="mt-3" style={{ color: "var(--warn)" }}>{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          {wsMaster && (
            <div className={`card ${wsMaster.id === masterId ? "on" : ""}`}>
              <label className="flex items-center gap-2">
                <input type="radio" checked={wsMaster.id === masterId} onChange={() => setMaster(wsMaster.id)} />
                <span className="font-medium">このフォルダの master.pptx</span>
              </label>
              {layoutSummary(wsMaster)}
            </div>
          )}
          {dirMasters.length === 0 && Object.keys(masterErrors).length === 0 && <p>まだ取り込んだマスターはありません。</p>}
          {dirMasters.map((m) => (
            <div key={m.id} className={`card ${m.id === masterId ? "on" : ""}`}>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 flex-1">
                  <input type="radio" checked={m.id === masterId} onChange={() => setMaster(m.id)} />
                  <span className="font-medium">{m.name}</span>
                  {defaultName === m.name && <span style={{ color: "var(--ink-2)" }}>既定</span>}
                </label>
                {defaultName !== m.name && <button className="link" style={{ color: "var(--ink-2)" }} onClick={() => settings.update((v) => { v.masters.default = m.name; })}>既定にする</button>}
                <button className="link" style={{ color: "var(--ink-2)" }} onClick={() => void remove(m.name)}>削除</button>
              </div>
              {layoutSummary(m)}
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
        <div className="mt-5 flex justify-end"><button className="btn" onClick={onClose}>閉じる</button></div>
      </div>
    </div>
  );
}
