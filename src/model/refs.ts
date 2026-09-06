import type { RenderedSlide } from "./types";
import { DECK_FILE } from "../workspace/workspace";

/** `deck.md:LINE` — the form Claude Code resolves directly; line is 1-based and points at the heading. */
export function slideRef(slide: RenderedSlide): string {
  if (slide.kind === "agenda") return DECK_FILE;
  return `${DECK_FILE}:${(slide.sourceLine ?? 0) + 1}`;
}

export interface Ref { label: string; text: string; detail: string }

/** Everything on a slide a person might paste into an instruction: the slide itself, then its images. */
export function slideRefs(slide: RenderedSlide): Ref[] {
  const hashes = slide.kind === "section" ? "#" : "##";
  const refs: Ref[] = [{ label: "スライド", text: slideRef(slide), detail: slide.kind === "body" || slide.kind === "section" ? `${hashes} ${slide.displayTitle}` : slide.displayTitle }];
  for (const img of slide.images) if (img.src) refs.push({ label: "画像", text: img.src, detail: img.alt });
  return refs;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}
