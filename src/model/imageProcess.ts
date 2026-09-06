/**
 * Pasted / dropped images are normalised before they land in images/:
 *  - the long edge is scaled down to `maxPx` (Retina screenshots arrive at 2x)
 *  - screenshots stay PNG; photo-like images become JPEG (quality 0.85)
 * Decoding uses createImageBitmap + OffscreenCanvas (Chromium / Electron). Elsewhere the original is kept.
 */
export const DEFAULT_MAX_PX = 2000;
export const JPEG_QUALITY = 0.85;

export function fitSize(w: number, h: number, maxPx: number): { w: number; h: number } {
  if (!maxPx || Math.max(w, h) <= maxPx) return { w, h };
  const k = maxPx / Math.max(w, h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export interface FormatHints { sampled: number; unique: number; srcType: string; hasAlpha?: boolean }

/** Photo-like (many distinct colours) → JPEG; UI captures (flat colours, text) → PNG; alpha and GIF are left alone. */
export function chooseFormat(h: FormatHints): "image/png" | "image/jpeg" | "image/gif" {
  if (h.srcType === "image/gif") return "image/gif";
  if (h.hasAlpha) return "image/png";
  if (h.srcType === "image/jpeg") return "image/jpeg";
  return h.unique / Math.max(1, h.sampled) > 0.5 ? "image/jpeg" : "image/png";
}

export interface ProcessOptions { maxPx?: number }
export interface Processed { blob: Blob; type: string; changed: boolean; width?: number; height?: number }

export async function processImage(src: Blob, opts: ProcessOptions = {}): Promise<Processed> {
  const maxPx = opts.maxPx ?? DEFAULT_MAX_PX;
  if (src.type === "image/gif" || typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return { blob: src, type: src.type, changed: false };
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(src); } catch { return { blob: src, type: src.type, changed: false }; }
  const srcW = bmp.width, srcH = bmp.height;
  const { w, h } = fitSize(srcW, srcH, maxPx);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  // Sample pixels to decide the format.
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor((w * h) / 4000));
  const seen = new Set<number>(); let sampled = 0, hasAlpha = false;
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4;
    if (data[o + 3] < 250) hasAlpha = true;
    seen.add((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]); sampled++;
  }
  const type = chooseFormat({ sampled, unique: seen.size, srcType: src.type, hasAlpha });
  const resized = w !== srcW || h !== srcH;
  // Nothing to do: same size, same format. Keep the original bytes (the browser's PNG encoder is often worse).
  if (!resized && type === src.type) return { blob: src, type: src.type, changed: false, width: w, height: h };
  const blob = await canvas.convertToBlob(type === "image/jpeg" ? { type, quality: JPEG_QUALITY } : { type });
  // Re-encoding without resizing only pays off if it is actually smaller.
  if (!resized && blob.size >= src.size) return { blob: src, type: src.type, changed: false, width: w, height: h };
  return { blob, type, changed: true, width: w, height: h };
}
