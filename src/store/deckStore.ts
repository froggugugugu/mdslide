import { create } from "zustand";
import { moveBlock, parseMarkdown, serializeDeck, withAttr } from "../model/parser";
import { renderDeck } from "../model/render";
import type { BodyLayout, Deck, RenderedSlide } from "../model/types";
import { layoutToAttrs } from "../layouts/geometry";
import { bootstrapWorkspace } from "../workspace/bootstrap";
import { DEFAULT_MAX_PX, processImage } from "../model/imageProcess";
import { findLayout, type MasterProfile } from "../master/importMaster";
import { bodyBoxFor, masterAutofit, masterBodyFontPt } from "../model/boxes";
import { listMasters } from "../master/masterStore";
import { SAMPLE_MARKDOWN } from "../sample";
import { importMaster } from "../master/importMaster";
import { saveMaster } from "../master/masterStore";
import {
  DECK_FILE, EXPORT_FILE, MASTER_FILE, OUTPUT_FILE, imageUrl, modifiedOf, pickWorkspace, readBlob, readText, restoreWorkspace,
  saveImage, writeText, type Workspace,
} from "../workspace/workspace";

interface DeckState {
  markdown: string;
  deck: Deck;
  slides: RenderedSlide[];
  selectedId: string | null;
  masters: MasterProfile[];
  masterId: string | null;
  /** Bumped when the store changes markdown itself (reorder, layout change) so the editor replaces its doc. */
  externalEditVersion: number;
  /** Line the editor should scroll to after a thumbnail click. */
  gotoLine: number | null;

  workspace: Workspace | null;
  /** deck.md has unsaved edits. */
  dirty: boolean;
  /** deck.md was changed on disk (e.g. by Claude Code) while there were unsaved edits. */
  externalChange: boolean;
  /** lastModified of deck.md as of the last read/write. */
  diskModified: number | null;
  /** Resolved object URLs for images referenced by relative path. */
  imageUrls: Record<string, string | null>;
  saveState: "idle" | "saving" | "saved";
  /** Non-fatal problem to show the user (e.g. corrupt master.pptx). */
  notice: string | null;
  setNotice: (n: string | null) => void;

  openWorkspace: () => Promise<void>;
  restoreWorkspace: () => Promise<void>;
  loadFromDisk: () => Promise<void>;
  /** force: overwrite even when deck.md changed on disk meanwhile. */
  save: (force?: boolean) => Promise<void>;
  pollDisk: () => Promise<void>;
  pasteImage: (blob: Blob, baseName: string) => Promise<string>;
  /** Resolve a markdown image path into imageUrls. Never rejects: a read failure is recorded as not found (null). */
  resolveImage: (src: string) => Promise<void>;
  exportDeckJson: (json: string) => Promise<"written" | "download">;
  /** Electron only: run the Python exporter. Result message for the UI. */
  runExport: () => Promise<{ ok: boolean; message: string }>;
  /** Called by the file watcher (Electron) with a workspace-relative path. */
  onFileChanged: (rel: string) => void;

  setMarkdown: (md: string) => void;
  select: (id: string | null) => void;
  selectByLine: (line: number) => void;
  move: (fromId: string, toId: string, place: "before" | "after") => void;
  setLayout: (blockId: string, layout: BodyLayout | null) => void;
  /** Set or clear one heading attribute ({size=16}) on a block. */
  setAttr: (blockId: string, key: string, value: string | null) => void;
  imageDims: Record<string, { w: number; h: number }>;
  setImageDims: (src: string, w: number, h: number) => void;
  refreshMasters: () => Promise<void>;
  setMaster: (id: string | null) => void;
  clearGoto: () => void;
}


/** Keep the selection on the same block when slide ids change (auto-split appears or disappears). */
function reselect(selectedId: string | null, slides: RenderedSlide[]): string | null {
  if (!selectedId) return null;
  if (slides.some((s) => s.id === selectedId)) return selectedId;
  const blockId = selectedId.replace(/#\d+$/, "");
  return slides.find((s) => s.blockId === blockId)?.id ?? (slides.some((s) => s.id === "cover") ? "cover" : null);
}

function derive(markdown: string, master: MasterProfile | undefined, imageDims: Record<string, { w: number; h: number }> = {}) {
  const deck = parseMarkdown(markdown);
  const slides = renderDeck(deck, {
    bodyBox: (layout, aspect) => bodyBoxFor(master, layout, aspect),
    masterFontPt: masterBodyFontPt(master),
    autofit: masterAutofit(master),
    imageAspect: (src) => { const d = imageDims[src]; return d ? d.w / d.h : undefined; },
  });
  return { deck, slides };
}

export const useDeckStore = create<DeckState>((set, get) => ({
  markdown: SAMPLE_MARKDOWN,
  ...derive(SAMPLE_MARKDOWN, undefined),
  selectedId: "cover",
  masters: [],
  masterId: null,
  externalEditVersion: 0,
  gotoLine: null,
  workspace: null,
  dirty: false,
  externalChange: false,
  diskModified: null,
  imageUrls: {},
  saveState: "idle",
  notice: null,
  setNotice: (notice) => set({ notice }),
  imageDims: {},
  setImageDims: (src, w, h) => {
    const cur = get().imageDims[src];
    if (cur && cur.w === w && cur.h === h) return;
    const imageDims = { ...get().imageDims, [src]: { w, h } };
    const master = get().masters.find((m) => m.id === get().masterId);
    set({ imageDims, ...derive(get().markdown, master, imageDims) }); // image aspect changes the text box on image slides
  },

  setMarkdown: (md) => {
    const master = get().masters.find((m) => m.id === get().masterId);
    const d = derive(md, master, get().imageDims);
    set({ markdown: md, ...d, selectedId: reselect(get().selectedId, d.slides), dirty: !!get().workspace, saveState: "idle" });
    scheduleAutosave();
  },
  select: (id) => set({ selectedId: id, gotoLine: get().slides.find((s) => s.id === id)?.sourceLine ?? null }),
  selectByLine: (line) => {
    const { deck, slides, selectedId } = get();
    const block = [...deck.blocks].reverse().find((b) => b.range[0] <= line);
    const target = block ? slides.find((s) => s.blockId === block.id)?.id ?? null : "cover";
    if (target && target !== selectedId) set({ selectedId: target });
  },
  move: (fromId, toId, place) => {
    const { deck, masters, masterId, externalEditVersion } = get();
    const next = moveBlock(deck, fromId, toId, place);
    if (next === deck) return;
    const md = serializeDeck(next);
    const master = masters.find((m) => m.id === masterId);
    const derived = derive(md, master, get().imageDims);
    // Keep selection on the moved block (its id may change because ids are ordinal-based).
    const movedTitle = deck.blocks.find((b) => b.id === fromId)?.title;
    const sel = derived.slides.find((s) => s.title === movedTitle && s.kind !== "agenda")?.id ?? null;
    set({ markdown: md, ...derived, selectedId: sel, externalEditVersion: externalEditVersion + 1, dirty: !!get().workspace });
    scheduleAutosave();
  },
  setLayout: (blockId, layout) => {
    const { deck, masters, masterId, externalEditVersion, selectedId } = get();
    const attrs = layout ? layoutToAttrs(layout) : { layout: null, img: null, side: null };
    const blocks = deck.blocks.map((b) => {
      if (b.id !== blockId) return b;
      return Object.entries(attrs).reduce((acc, [k, v]) => withAttr(acc, k, v), b);
    });
    const md = serializeDeck({ ...deck, blocks });
    const master = masters.find((m) => m.id === masterId);
    const d = derive(md, master, get().imageDims);
    set({ markdown: md, ...d, selectedId: reselect(selectedId, d.slides), externalEditVersion: externalEditVersion + 1, dirty: !!get().workspace });
    scheduleAutosave();
  },
  setAttr: (blockId, key, value) => {
    const { deck, masters, masterId, externalEditVersion, selectedId } = get();
    const blocks = deck.blocks.map((b) => (b.id === blockId ? withAttr(b, key, value) : b));
    const md = serializeDeck({ ...deck, blocks });
    const master = masters.find((m) => m.id === masterId);
    const d = derive(md, master, get().imageDims);
    set({ markdown: md, ...d, selectedId: reselect(selectedId, d.slides), externalEditVersion: externalEditVersion + 1, dirty: !!get().workspace });
    scheduleAutosave();
  },
  refreshMasters: async () => {
    const masters = await listMasters();
    const masterId = get().masterId ?? masters[0]?.id ?? null;
    const master = masters.find((m) => m.id === masterId);
    set({ masters, masterId, ...derive(get().markdown, master, get().imageDims) });
  },
  setMaster: (id) => {
    const master = get().masters.find((m) => m.id === id);
    set({ masterId: id, ...derive(get().markdown, master, get().imageDims) });
  },
  clearGoto: () => set({ gotoLine: null }),

  openWorkspace: async () => {
    const ws = await pickWorkspace();
    if (!ws) return;
    set({ workspace: ws, imageUrls: {} });
    await get().loadFromDisk();
  },
  restoreWorkspace: async () => {
    try {
      const ws = await restoreWorkspace();
      if (!ws) return;
      set({ workspace: ws, imageUrls: {} });
      await get().loadFromDisk();
    } catch (e) {
      // A stale handle (folder moved, permission revoked) must not break startup.
      set({ workspace: null, notice: `前回のフォルダを開けませんでした: ${e instanceof Error ? e.message : String(e)}` });
    }
  },
  loadFromDisk: async () => {
    const ws = get().workspace;
    if (!ws) return;
    // master.pptx in the folder wins over the stored history.
    const masterFile = await readBlob(ws, MASTER_FILE);
    const masterModified = await modifiedOf(ws, MASTER_FILE);
    if (masterFile && masterModified !== null) {
      const id = `ws:${ws.name}`;
      const existing = get().masters.find((m) => m.id === id);
      if (!existing || existing.importedAt < new Date(masterModified).toISOString()) {
        try {
          const profile = await importMaster(masterFile, `${ws.name}/${MASTER_FILE}`);
          profile.id = id;
          profile.importedAt = new Date(masterModified).toISOString();
          await saveMaster(profile, masterFile);
          await get().refreshMasters();
          set({ notice: null });
        } catch (e) {
          set({ notice: `${MASTER_FILE} を読み込めませんでした: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
      if (get().masters.some((m) => m.id === id)) get().setMaster(id);
    }
    // Files an interactive agent needs: CLAUDE.md (once), theme.json and the drawing helper (kept in sync).
    await bootstrapWorkspace(ws.backend, get().masters.find((m) => m.id === get().masterId)).catch(() => undefined);
    const deck = await readText(ws, DECK_FILE);
    const master = get().masters.find((m) => m.id === get().masterId);
    if (deck) {
      set({ markdown: deck.text, ...derive(deck.text, master, get().imageDims), diskModified: deck.modified, dirty: false, externalChange: false,
        externalEditVersion: get().externalEditVersion + 1, selectedId: "cover", imageUrls: {} });
    } else {
      const modified = await writeText(ws, DECK_FILE, get().markdown);
      set({ diskModified: modified, dirty: false });
    }
  },
  save: async (force = false) => {
    const { workspace, markdown, dirty, externalChange } = get();
    if (!workspace || !dirty || (externalChange && !force)) return;
    set({ saveState: "saving" });
    const modified = await writeText(workspace, DECK_FILE, markdown);
    set({ diskModified: modified, dirty: false, externalChange: false, saveState: "saved" });
  },
  pollDisk: async () => {
    const { workspace, diskModified, dirty } = get();
    if (!workspace || diskModified === null) return;
    const m = await modifiedOf(workspace, DECK_FILE);
    const masterM = await modifiedOf(workspace, MASTER_FILE);
    const masterStale = masterM !== null && (get().masters.find((x) => x.id === `ws:${workspace.name}`)?.importedAt ?? "") < new Date(masterM).toISOString();
    if ((m === null || m <= diskModified) && !masterStale) return;
    if (masterStale && (m === null || m <= diskModified)) { await get().loadFromDisk(); return; }
    if (dirty) { set({ externalChange: true }); return; }
    // Viewer mode: Claude Code (or anything else) rewrote deck.md; pick it up.
    const selectedId = get().selectedId;
    await get().loadFromDisk();
    if (get().slides.some((s) => s.id === selectedId)) set({ selectedId });
  },
  pasteImage: async (blob, baseName) => {
    const ws = get().workspace;
    if (!ws) throw new Error("フォルダを開いてから画像を貼り付けてください。");
    // Retina captures are scaled to the deck's limit and photo-like images compressed before they are stored.
    const maxPx = get().deck.meta.imageMaxPx ?? DEFAULT_MAX_PX;
    const processed = await processImage(blob, { maxPx });
    const stored = processed.changed ? new Blob([processed.blob], { type: processed.type }) : blob;
    const rel = await saveImage(ws, stored, baseName);
    set({ imageUrls: { ...get().imageUrls, [rel]: URL.createObjectURL(stored) } });
    if (processed.width && processed.height) get().setImageDims(rel, processed.width, processed.height);
    if (processed.changed) set({ notice: `画像を ${processed.width}×${processed.height}${processed.type !== blob.type ? ` / ${processed.type === "image/jpeg" ? "JPEG" : "PNG"}` : ""} で保存しました（${Math.round(stored.size / 1024)} KB、元 ${Math.round(blob.size / 1024)} KB）。` });
    return rel;
  },
  resolveImage: async (src) => {
    const { workspace, imageUrls } = get();
    if (!workspace || src in imageUrls || /^(https?:|data:|blob:)/.test(src)) return;
    set({ imageUrls: { ...imageUrls, [src]: null } }); // mark as loading
    const url = await imageUrl(workspace, src).catch(() => null); // unreadable counts as not found; never leak a rejection into React effects
    set({ imageUrls: { ...get().imageUrls, [src]: url } });
  },
  exportDeckJson: async (json) => {
    const ws = get().workspace;
    if (!ws) return "download";
    await writeText(ws, EXPORT_FILE, json);
    return "written";
  },
  runExport: async () => {
    const ws = get().workspace;
    if (!ws?.backend.runExport) return { ok: false, message: "この環境では pptx 生成を直接実行できません。deck.json を書き出して tools/export_pptx.py を実行してください。" };
    if (!(await ws.backend.exists(MASTER_FILE))) return { ok: false, message: `フォルダに ${MASTER_FILE} がありません。マスターの pptx をこの名前で置いてください。` };
    const r = await ws.backend.runExport(EXPORT_FILE, MASTER_FILE, OUTPUT_FILE);
    if (r.code !== 0) return { ok: false, message: `生成に失敗しました (${r.code})。${r.stderr.trim().split("\n").slice(-3).join(" / ")}` };
    const warnings = r.stderr.trim() ? ` 警告: ${r.stderr.trim().split("\n").length}件（${r.stderr.trim().split("\n")[0]}）` : "";
    return { ok: true, message: `${OUTPUT_FILE} を生成しました。${warnings}` };
  },
  onFileChanged: (rel) => {
    if (rel === DECK_FILE || rel === MASTER_FILE) void get().pollDisk();
    else if (rel.startsWith("images/")) {
      // Drop the cached URL so the preview picks up a regenerated image.
      const { imageUrls } = get();
      if (rel in imageUrls) { const next = { ...imageUrls }; delete next[rel]; set({ imageUrls: next }); }
    }
  },
}));

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { void useDeckStore.getState().save(); }, 1500);
}

export function useCurrentMaster(): MasterProfile | undefined {
  return useDeckStore((s) => s.masters.find((m) => m.id === s.masterId));
}

export { findLayout };
