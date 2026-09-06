import { useRef, useState } from "react";
import { importMaster } from "../master/importMaster";
import { removeMaster, saveMaster } from "../master/masterStore";
import { useDeckStore } from "../store/deckStore";

export function MasterDialog({ onClose }: { onClose: () => void }) {
  const masters = useDeckStore((s) => s.masters);
  const masterId = useDeckStore((s) => s.masterId);
  const setMaster = useDeckStore((s) => s.setMaster);
  const refresh = useDeckStore((s) => s.refreshMasters);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setBusy(true); setError(null);
    try {
      const profile = await importMaster(file, file.name.replace(/\.(pptx|potx)$/i, ""));
      await saveMaster(profile, file);
      await refresh();
      setMaster(profile.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>スライドマスター</h2>
        <p>レイアウト名を Cover / Agenda / Section / Body-Text / Body-2col と付けた pptx を取り込みます。画像スライドは Body-Text の上にツールが配置します。書式・配色・ロゴはパワポ側で整えてください。</p>
        <input ref={fileRef} type="file" accept=".pptx,.potx" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? "取り込み中" : "pptx を取り込む"}</button>
        {error && <p className="mt-3" style={{ color: "var(--warn)" }}>{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          {masters.length === 0 && <p>まだ取り込んだマスターはありません。</p>}
          {masters.map((m) => (
            <div key={m.id} className={`card ${m.id === masterId ? "on" : ""}`}>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 flex-1">
                  <input type="radio" checked={m.id === masterId} onChange={() => setMaster(m.id)} />
                  <span className="font-medium">{m.name}</span>
                  <span style={{ color: "var(--ink-2)" }}>{new Date(m.importedAt).toLocaleString("ja-JP")}</span>
                </label>
                <button className="link" style={{ color: "var(--ink-2)" }} onClick={async () => { await removeMaster(m.id); if (masterId === m.id) setMaster(null); await refresh(); }}>削除</button>
              </div>
              <div className="mt-2 text-[12px]" style={{ color: "var(--ink-2)" }}>
                {m.layouts.filter((l) => l.role).map((l) => l.name).join(" · ") || "対応レイアウトなし"}
              </div>
              {m.missing.length > 0 && <div className="mt-1 text-[12px]" style={{ color: "var(--warn)" }}>不足: {m.missing.join(", ")}</div>}
              {m.unmapped.length > 0 && <div className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>未使用: {m.unmapped.join(", ")}</div>}
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end"><button className="btn" onClick={onClose}>閉じる</button></div>
      </div>
    </div>
  );
}
