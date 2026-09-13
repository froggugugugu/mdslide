/**
 * Where an image in deck.md may come from (ADR-0026). Only files inside the deck folder are read, so a deck someone
 * sends cannot make the preview fetch a URL (telling the sender it was opened) or put other files on this Mac into the
 * exported pptx. data:image URLs carry their own bytes and are shown as they are. tools/export_pptx.py applies the
 * same rule (asset_path).
 */
export type ImageSource =
  | { kind: "file"; path: string }
  | { kind: "data" }
  | { kind: "external" }
  | { kind: "outside" };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function imageSource(src: string): ImageSource {
  if (/^[a-z]:[\\/]/i.test(src) || src.startsWith("/") || src.startsWith("\\")) return { kind: "outside" };
  if (/^data:image\//i.test(src)) return { kind: "data" };
  if (SCHEME.test(src)) return { kind: "external" };
  const parts: string[] = [];
  for (const seg of src.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") parts.push(seg);
    else if (parts.length) parts.pop();
    else return { kind: "outside" };
  }
  return { kind: "file", path: parts.join("/") };
}
