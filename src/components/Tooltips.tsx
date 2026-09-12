import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Tip { text: string; rect: DOMRect }

/**
 * Hover and keyboard-focus hints for the app's controls. Any element with a `data-tip` attribute shows a small tooltip
 * after a short delay; once one has been shown, moving straight on to the next control shows its hint at once, as on
 * macOS. Used instead of the native `title`, which appears only after a long delay. Mounted once by App.
 */
export function Tooltips({ delay = 450 }: { delay?: number }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current: HTMLElement | null = null;
    let warmUntil = 0;
    let keyboard = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    /** cool: a click or a scroll ends the "warm" streak, so the next hint waits for the delay again. */
    const hide = (cool = false) => {
      clear();
      warmUntil = cool ? 0 : current ? Date.now() + 700 : warmUntil;
      current = null;
      setTip(null);
    };
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      clear();
      current = el;
      const open = () => { timer = null; if (current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() }); };
      if (delay <= 0 || Date.now() < warmUntil) open(); else timer = setTimeout(open, delay);
    };
    const tipOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>("[data-tip]") : null);
    const onOver = (e: MouseEvent) => { keyboard = false; const el = tipOf(e.target); if (el && el !== current) show(el); };
    const onOut = (e: MouseEvent) => {
      if (!current || tipOf(e.target) !== current) return;
      if (e.relatedTarget instanceof Node && current.contains(e.relatedTarget)) return; // still inside the control (its icon)
      hide();
    };
    const onDown = () => hide(true);
    const onKey = () => { keyboard = true; if (current) hide(); };
    const onFocus = (e: FocusEvent) => { if (!keyboard) return; const el = tipOf(e.target); if (el) show(el); };
    const onBlur = (e: FocusEvent) => { if (current && tipOf(e.target) === current) hide(); };
    const onAway = () => { if (current) hide(true); };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onAway, true);
    window.addEventListener("blur", onAway);
    return () => {
      clear();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onAway, true);
      window.removeEventListener("blur", onAway);
    };
  }, [delay]);

  // Below the control, centred; above it when there is no room; always inside the window.
  useLayoutEffect(() => {
    if (!tip) { setPos(null); return; }
    const w = box.current?.offsetWidth ?? 0, h = box.current?.offsetHeight ?? 0;
    const gap = 6, margin = 6, vw = window.innerWidth, vh = window.innerHeight;
    let top = tip.rect.bottom + gap;
    if (top + h > vh - margin) top = Math.max(margin, tip.rect.top - h - gap);
    const left = Math.max(margin, Math.min(vw - w - margin, tip.rect.left + tip.rect.width / 2 - w / 2));
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={box} role="tooltip" className="tooltip" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}>
      {tip.text}
    </div>
  );
}
