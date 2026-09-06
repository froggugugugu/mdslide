import React, { useEffect, useState } from "react";
import { copyText, slideRefs } from "../model/refs";
import { useTerminalStore } from "../console/terminalStore";
import { useCurrentMaster, useDeckStore } from "../store/deckStore";
import { SlideCanvas } from "./SlideCanvas";
import { findLayout } from "../master/importMaster";
import { layoutLabel, type ImageWidth, type Side } from "../layouts/geometry";


export function PreviewPane() {
  const slides = useDeckStore((s) => s.slides);
  const selectedId = useDeckStore((s) => s.selectedId);
  const setLayout = useDeckStore((s) => s.setLayout);
  const setAttr = useDeckStore((s) => s.setAttr);
  const deck = useDeckStore((s) => s.deck);
  const master = useCurrentMaster();
  const slide = slides.find((s) => s.id === selectedId) ?? slides[0];
  if (!slide) return null;
  const block = deck.blocks.find((b) => b.id === slide.blockId);
  const explicit = block ? "layout" in block.attrs || "img" in block.attrs || "side" in block.attrs : false;
  const masterLayout = master ? findLayout(master, slide.kind, slide.layout.kind === "2col" ? "2col" : "text") : undefined;
  const L = slide.layout;
  const img = L.kind === "image" ? L : null;
  const setImage = (width: ImageWidth, side: Side) => block && setLayout(block.id, { kind: "image", width, side });
  const index = slides.indexOf(slide);

  const refs = slideRefs(slide);
  const [copied, setCopied] = useState<string | null>(null);
  const termWrite = useTerminalStore((s) => s.write);
  const termOpen = useTerminalStore((s) => s.ptyId !== null);
  const copy = async (text: string) => { if (await copyText(text)) { setCopied(text); setTimeout(() => setCopied(null), 1200); } };
  // ⌘⇧C copies the current slide reference without leaving the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) { e.preventDefault(); void copy(refs[0].text); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refs]); // eslint-disable-line react-hooks/exhaustive-deps

  const Seg = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button className={`seg ${on ? "on" : ""}`} onClick={onClick}>{children}</button>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center p-10 min-h-0">
        <div className="slide-frame w-full max-w-[1000px]">
          <SlideCanvas slide={slide} master={master} />
        </div>
      </div>
      <div className="footer px-8 pb-5 flex items-center gap-3 flex-wrap">
        <span className="tabular-nums" style={{ minWidth: 44 }}>{index + 1} / {slides.length}</span>
        {slide.kind === "body" && block && (
          <>
            <div className="segmented">
              <Seg on={L.kind === "text"} onClick={() => setLayout(block.id, { kind: "text" })}>テキスト</Seg>
              <Seg on={L.kind === "2col"} onClick={() => setLayout(block.id, { kind: "2col" })}>2カラム</Seg>
              <Seg on={L.kind === "image"} onClick={() => setImage(img?.width ?? 0.5, img?.side ?? "right")}>画像</Seg>
            </div>
            {img && (
              <>
                <span className="seg-label">幅</span>
                <div className="segmented">
                  {([1, 0.75, 0.5] as ImageWidth[]).map((w) => (
                    <Seg key={w} on={img.width === w} onClick={() => setImage(w, img.side)}>{w === 1 ? "1/1" : w === 0.75 ? "3/4" : "1/2"}</Seg>
                  ))}
                </div>
                <span className="seg-label">配置</span>
                <div className="segmented">
                  {(["left", "right"] as Side[]).map((sd) => (
                    <Seg key={sd} on={img.side === sd} onClick={() => setImage(img.width, sd)}>{sd === "left" ? "左" : "右"}</Seg>
                  ))}
                </div>
              </>
            )}
            {explicit && <button className="link" onClick={() => setLayout(block.id, null)}>既定に戻す</button>}
            <span className="seg-label">文字</span>
            <div className="segmented" aria-label="本文フォントサイズ">
              <button className="seg" aria-label="小さく" onClick={() => setAttr(block.id, "size", String(Math.max(8, (slide.fontPt ?? 18) - 2)))}>−</button>
              <span className="seg on" style={{ minWidth: 48, textAlign: "center" }}>{slide.fontPt}pt{block.attrs.size ? "" : " (既定)"}</span>
              <button className="seg" aria-label="大きく" onClick={() => setAttr(block.id, "size", String(Math.min(48, (slide.fontPt ?? 18) + 2)))}>+</button>
            </div>
            {block.attrs.size && <button className="link" onClick={() => setAttr(block.id, "size", null)}>既定の大きさ</button>}
            {slide.fit && (
              <span className={`fit ${slide.fit.used > slide.fit.capacity ? "over" : slide.fit.used > slide.fit.capacity * 0.9 ? "near" : ""}`} title="推定の表示行数。PowerPoint 側と 1 行程度ずれることがあります">
                推定 {Math.ceil(slide.fit.used)} / {slide.fit.capacity} 行{slide.fit.autofit ? " · マスターは自動縮小あり" : ""}
              </span>
            )}
          </>
        )}
        <span className="flex-1" />
        {slide.continuation && <span>自動分割 {slide.continuation.index}/{slide.continuation.total}</span>}
        {master && (
          <span style={{ color: masterLayout ? "var(--ink-2)" : "var(--warn)" }}>
            {masterLayout ? `${layoutLabel(L)} · ${masterLayout.name}` : "マスターに対応するレイアウトがありません"}
          </span>
        )}
        {!master && <span style={{ color: "var(--warn)" }}>既定レイアウトでプレビュー中</span>}
      </div>
      <div className="refs px-8 pb-4 flex items-center gap-2 flex-wrap" aria-label="Claude Code 用の参照">
        <span className="seg-label" style={{ marginLeft: 0 }}>参照</span>
        {refs.map((r) => (
          <span key={r.text} className="ref">
            <button className="ref-copy" title={`${r.detail} をクリップボードへ (⌘⇧C はスライド)`} onClick={() => copy(r.text)}>
              <code>{r.text}</code>
              <span className="ref-detail">{copied === r.text ? "コピーしました" : r.detail}</span>
            </button>
            {termOpen && <button className="ref-term" title="端末に貼る" onClick={() => termWrite(r.text + " ")}>端末へ</button>}
          </span>
        ))}
      </div>
      {slide.notes.length > 0 && (
        <div className="mx-8 mb-5 px-3 py-2 text-[12px]" style={{ background: "var(--control)", borderRadius: 8, color: "var(--ink-2)" }}>
          ノート · {slide.notes.join(" / ")}
        </div>
      )}
    </div>
  );
}
