import { create } from "zustand";
import { moveBlock, parseMarkdown, serializeDeck, withAttr, withMeta } from "../model/parser";
import { renderDeck } from "../model/render";
import type { BodyLayout, Deck, DeckMeta, RenderedSlide } from "../model/types";
import { layoutToAttrs } from "../layouts/geometry";
import { bootstrapWorkspace } from "../workspace/bootstrap";
import { DEFAULT_MAX_PX, processImage } from "../model/imageProcess";
import { findLayout, type MasterProfile } from "../master/importMaster";
import { bodyBoxFor, masterAutofit, masterBodyFontPt } from "../model/boxes";
import { SAMPLE_MARKDOWN } from "../sample";
import { newDeckTemplate } from "../model/template";
import { importMaster } from "../master/importMaster";
import { masterSource } from "../master/masterSource";
import { settings } from "../settings/settings";
import {
  EXPORT_FILE, MASTER_FILE, OUTPUT_FILE, createWorkspaceFolder, imageUrl, modifiedOf, openMarkdownFile, openRecentWorkspace, pickWorkspace,
  readBlob, readText, restoreWorkspace, saveImage, writeText, type RecentEntry, type Workspace,
} from "../workspace/workspace";

interface DeckState {
  markdown: string;
  deck: Deck;
  slides: RenderedSlide[];
  selectedId: string | null;
  /** The masters folder's files (id "dir:<name>") plus the workspace's own master.pptx (id "ws:<folder>"). */
  masters: MasterProfile[];
  /** Resolved from the frontmatter, the folder's master.pptx, then the configured default. Derived. */
  masterId: string | null;
  /** The frontmatter names a master that is not in the folder (null when fine). Derived. */
  masterMissing: string | null;
  /** Files in the masters folder that could not be parsed, by name. */
  masterErrors: Record<string, string>;
  /** Bumped when the store changes markdown itself (reorder, layout change) so the editor replaces its doc. */
  externalEditVersion: number;
  /** Line the editor should scroll to after a thumbnail click. */
  gotoLine: number | null;

  workspace: Workspace | null;
  /** false until a document is opened or the sample is shown: the start screen is up. */
  started: boolean;
  /** The deck file has unsaved edits. */
  dirty: boolean;
  /** The deck file was changed on disk (e.g. by Claude Code) while there were unsaved edits. */
  externalChange: boolean;
  /** lastModified of the deck file as of the last read/write. */
  diskModified: number | null;
  /** Resolved object URLs for images referenced by relative path. */
  imageUrls: Record<string, string | null>;
  saveState: "idle" | "saving" | "saved";
  /** Non-fatal problem to show the user (e.g. corrupt master.pptx). */
  notice: string | null;
  setNotice: (n: string | null) => void;

  /** Open a folder; its deck.md is the document (scaffolded when missing). */
  openWorkspace: () => Promise<void>;
  /** Desktop: pick a Markdown file; its folder becomes the workspace and the file keeps its name. */
  openMarkdown: () => Promise<void>;
  /** Desktop: choose (or create) the folder of a new deck; its deck.md is scaffolded as an empty frame (newDeckTemplate). */
  createMarkdown: () => Promise<void>;
  openRecent: (entry: RecentEntry) => Promise<void>;
  /** Show the built-in sample without a workspace; nothing is saved. */
  viewSample: () => void;
  restoreWorkspace: () => Promise<void>;
  /** Read the deck file (and the folder's master.pptx). A missing deck file is written from `scaffold`, else from the current document. */
  loadFromDisk: (scaffold?: string) => Promise<void>;
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
  /** Keyboard navigation in the navigator: the previous/next slide, clamped at the ends. Nothing selected: the first slide. */
  selectAdjacent: (dir: -1 | 1) => void;
  /**
   * Keyboard reorder: move the selected slide's block one step up/down. A section steps over the neighbouring section
   * (with all of its slides); a body steps over the neighbouring block, crossing section boundaries like a drag does.
   * Returns false when nothing moved (cover, agenda, end of deck, section with no section to step over).
   */
  moveSelected: (dir: -1 | 1) => boolean;
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

interface MasterCtx { wsName: string | null; defaultMaster: string | null }

/**
 * Which master applies (ADR-0013), in order: the frontmatter (`master: name.pptx` from the masters folder, `none` for no
 * master), the workspace's own master.pptx, then the default configured in the settings. Nothing is picked beyond that.
 */
export function resolveMasterId(meta: DeckMeta, masters: MasterProfile[], ctx: MasterCtx): { id: string | null; missing: string | null } {
  const has = (id: string) => masters.some((m) => m.id === id);
  if (meta.master === "none") return { id: null, missing: null };
  if (meta.master) return has(`dir:${meta.master}`) ? { id: `dir:${meta.master}`, missing: null } : { id: null, missing: meta.master };
  if (ctx.wsName && has(`ws:${ctx.wsName}`)) return { id: `ws:${ctx.wsName}`, missing: null };
  if (ctx.defaultMaster && has(`dir:${ctx.defaultMaster}`)) return { id: `dir:${ctx.defaultMaster}`, missing: null };
  return { id: null, missing: null };
}

function derive(markdown: string, masters: MasterProfile[], ctx: MasterCtx, imageDims: Record<string, { w: number; h: number }> = {}) {
  const deck = parseMarkdown(markdown);
  const { id: masterId, missing: masterMissing } = resolveMasterId(deck.meta, masters, ctx);
  const master = masters.find((m) => m.id === masterId);
  const slides = renderDeck(deck, {
    bodyBox: (layout, aspect) => bodyBoxFor(master, layout, aspect),
    masterFontPt: masterBodyFontPt(master),
    autofit: masterAutofit(master),
    imageAspect: (src) => { const d = imageDims[src]; return d ? d.w / d.h : undefined; },
  });
  return { deck, slides, masterId, masterMissing };
}

/** Parsed masters-folder files, keyed by name, so a refresh only re-reads what changed. */
const parsedMasters = new Map<string, { modified: number; profile: MasterProfile }>();

export const useDeckStore = create<DeckState>((set, get) => {
  const ctx = (): MasterCtx => ({ wsName: get().workspace?.name ?? null, defaultMaster: settings.get().masters.default });
  const recompute = (md: string, imageDims = get().imageDims) => derive(md, get().masters, ctx(), imageDims);
  // The default master is a setting: when it changes (settings sheet, hand edit), decks that name none follow it.
  let lastDefault = settings.get().masters.default;
  settings.subscribe((s) => { if (s.masters.default !== lastDefault) { lastDefault = s.masters.default; set(recompute(get().markdown)); } });
  return {
  markdown: SAMPLE_MARKDOWN,
  ...derive(SAMPLE_MARKDOWN, [], { wsName: null, defaultMaster: null }),
  selectedId: "cover",
  masters: [],
  masterErrors: {},
  externalEditVersion: 0,
  gotoLine: null,
  workspace: null,
  started: false,
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
    set({ imageDims, ...recompute(get().markdown, imageDims) }); // image aspect changes the text box on image slides
  },

  setMarkdown: (md) => {
    const d = recompute(md);
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
  selectAdjacent: (dir) => {
    const { slides, selectedId } = get();
    if (!slides.length) return;
    const i = slides.findIndex((s) => s.id === selectedId);
    const next = i < 0 ? slides[0] : slides[Math.max(0, Math.min(slides.length - 1, i + dir))];
    if (next.id !== selectedId) get().select(next.id);
  },
  moveSelected: (dir) => {
    const { slides, selectedId } = get();
    const cur = slides.find((s) => s.id === selectedId);
    if (!cur?.blockId) return false;
    const i = slides.indexOf(cur);
    const ahead = dir < 0 ? slides.slice(0, i).reverse() : slides.slice(i + 1);
    // A section steps over sections only; a body steps over the nearest other block (agenda slides have no block).
    const target = ahead.find((s) => s.blockId && s.blockId !== cur.blockId && (cur.kind !== "section" || s.kind === "section"));
    if (!target?.blockId) return false;
    const before = get().deck;
    get().move(cur.blockId, target.blockId, dir < 0 ? "before" : "after");
    return get().deck !== before;
  },
  move: (fromId, toId, place) => {
    const { deck, externalEditVersion } = get();
    const next = moveBlock(deck, fromId, toId, place);
    if (next === deck) return;
    const md = serializeDeck(next);
    const derived = recompute(md);
    // Keep selection on the moved block (its id may change because ids are ordinal-based).
    const movedTitle = deck.blocks.find((b) => b.id === fromId)?.title;
    const sel = derived.slides.find((s) => s.title === movedTitle && s.kind !== "agenda")?.id ?? null;
    set({ markdown: md, ...derived, selectedId: sel, externalEditVersion: externalEditVersion + 1, dirty: !!get().workspace });
    scheduleAutosave();
  },
  setLayout: (blockId, layout) => {
    const { deck, externalEditVersion, selectedId } = get();
    const attrs = layout ? layoutToAttrs(layout) : { layout: null, img: null, side: null };
    const blocks = deck.blocks.map((b) => {
      if (b.id !== blockId) return b;
      return Object.entries(attrs).reduce((acc, [k, v]) => withAttr(acc, k, v), b);
    });
    const md = serializeDeck({ ...deck, blocks });
    const d = recompute(md);
    set({ markdown: md, ...d, selectedId: reselect(selectedId, d.slides), externalEditVersion: externalEditVersion + 1, dirty: !!get().workspace });
    scheduleAutosave();
  },
  setAttr: (blockId, key, value) => {
    const { deck, externalEditVersion, selectedId } = get();
    const blocks = deck.blocks.map((b) => (b.id === blockId ? withAttr(b, key, value) : b));
    const md = serializeDeck({ ...deck, blocks });
    const d = recompute(md);
    set({ markdown: md, ...d, selectedId: reselect(selectedId, d.slides), externalEditVersion: externalEditVersion + 1, dirty: !!get().workspace });
    scheduleAutosave();
  },
  refreshMasters: async () => {
    // Re-read the masters folder; files that changed are parsed again, the rest come from the cache.
    const entries = await masterSource.list();
    const masterErrors: Record<string, string> = {};
    const fromDir: MasterProfile[] = [];
    for (const e of entries) {
      const cached = parsedMasters.get(e.name);
      if (cached && cached.modified === e.modified) { fromDir.push(cached.profile); continue; }
      try {
        const blob = await masterSource.read(e.name);
        if (!blob) continue;
        const profile = await importMaster(blob, e.name);
        profile.id = `dir:${e.name}`;
        profile.importedAt = new Date(e.modified).toISOString();
        parsedMasters.set(e.name, { modified: e.modified, profile });
        fromDir.push(profile);
      } catch (err) {
        parsedMasters.delete(e.name);
        masterErrors[e.name] = err instanceof Error ? err.message : String(err);
      }
    }
    const masters = [...get().masters.filter((m) => m.id.startsWith("ws:")), ...fromDir];
    set({ masters, masterErrors, ...derive(get().markdown, masters, ctx(), get().imageDims) });
  },
  setMaster: (id) => {
    // The choice lives in the markdown: a folder master by name, "none" to turn masters off,
    // no key when the folder's own master.pptx (or nothing) is what applies anyway.
    const { deck, selectedId, externalEditVersion } = get();
    const silent = resolveMasterId(withMeta(deck, "master", null).meta, get().masters, ctx()).id;
    const value = id === null ? (silent === null ? null : "none") : id.startsWith("ws:") ? null : id.slice("dir:".length);
    const md = serializeDeck(withMeta(deck, "master", value));
    const d = recompute(md);
    set({ markdown: md, ...d, selectedId: reselect(selectedId, d.slides), externalEditVersion: externalEditVersion + 1, dirty: !!get().workspace });
    scheduleAutosave();
  },
  clearGoto: () => set({ gotoLine: null }),

  openWorkspace: async () => {
    const ws = await pickWorkspace();
    if (ws) await adopt(ws);
  },
  openMarkdown: async () => {
    const ws = await openMarkdownFile();
    if (ws) await adopt(ws);
  },
  createMarkdown: async () => {
    // A folder is chosen (or created in the dialog); the deck is deck.md inside it, titled after the folder.
    const ws = await createWorkspaceFolder();
    if (ws) await adopt(ws, newDeckTemplate(ws.deckFile, new Date(), ws.name));
  },
  openRecent: async (entry) => {
    const ws = await openRecentWorkspace(entry);
    if (!ws) { set({ notice: `${entry.path}/${entry.deckFile} が見つかりません。` }); return; }
    await adopt(ws);
  },
  viewSample: () => {
    set({ workspace: null, started: true, markdown: SAMPLE_MARKDOWN, ...derive(SAMPLE_MARKDOWN, get().masters, { wsName: null, defaultMaster: settings.get().masters.default }, get().imageDims),
      selectedId: "cover", dirty: false, externalChange: false, externalEditVersion: get().externalEditVersion + 1 });
  },
  restoreWorkspace: async () => {
    try {
      const ws = await restoreWorkspace();
      if (!ws) return;
      await adopt(ws);
    } catch (e) {
      // A stale handle (folder moved, permission revoked) must not break startup.
      set({ workspace: null, notice: `前回のフォルダを開けませんでした: ${e instanceof Error ? e.message : String(e)}` });
    }
  },
  loadFromDisk: async (scaffold) => {
    const ws = get().workspace;
    if (!ws) return;
    // The folder's own master.pptx is parsed in place (id ws:<folder>) and never copied anywhere.
    const masterFile = await readBlob(ws, MASTER_FILE);
    const masterModified = await modifiedOf(ws, MASTER_FILE);
    const wsId = `ws:${ws.name}`;
    const others = get().masters.filter((m) => !m.id.startsWith("ws:"));
    const existing = get().masters.find((m) => m.id === wsId);
    if (masterFile && masterModified !== null) {
      const stamp = new Date(masterModified).toISOString();
      if (existing && existing.importedAt >= stamp) set({ masters: [existing, ...others] });
      else {
        try {
          const profile = await importMaster(masterFile, `${ws.name}/${MASTER_FILE}`);
          profile.id = wsId;
          profile.importedAt = stamp;
          set({ masters: [profile, ...others], notice: null });
        } catch (e) {
          set({ masters: others, notice: `${MASTER_FILE} を読み込めませんでした: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    } else if (get().masters.length !== others.length) set({ masters: others });
    const deck = await readText(ws, ws.deckFile);
    const text = deck ? deck.text : scaffold ?? get().markdown;
    const d = recompute(text);
    // Files an interactive agent needs: CLAUDE.md (once), theme.json (from the deck's master) and the drawing helper.
    await bootstrapWorkspace(ws.backend, get().masters.find((m) => m.id === d.masterId), ws.deckFile).catch(() => undefined);
    if (deck) {
      set({ markdown: deck.text, ...d, diskModified: deck.modified, dirty: false, externalChange: false,
        externalEditVersion: get().externalEditVersion + 1, selectedId: "cover", imageUrls: {} });
    } else {
      // No deck file yet: the scaffold (an empty frame for a new file; otherwise the current document, i.e. the sample) is written
      // and becomes the document. The editor must be told too, or it keeps showing whatever it held before (the sample).
      const modified = await writeText(ws, ws.deckFile, text);
      set({ markdown: text, ...d, diskModified: modified, dirty: false, externalChange: false,
        externalEditVersion: get().externalEditVersion + 1, selectedId: "cover", imageUrls: {} });
    }
  },
  save: async (force = false) => {
    const { workspace, markdown, dirty, externalChange } = get();
    if (!workspace || !dirty || (externalChange && !force)) return;
    set({ saveState: "saving" });
    const modified = await writeText(workspace, workspace.deckFile, markdown);
    set({ diskModified: modified, dirty: false, externalChange: false, saveState: "saved" });
  },
  pollDisk: async () => {
    const { workspace, diskModified, dirty } = get();
    if (!workspace || diskModified === null) return;
    const m = await modifiedOf(workspace, workspace.deckFile);
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
    // The resolved master: a masters-folder file by absolute path, or the folder's own master.pptx (even when the app
    // could not parse it, so Python gets its say).
    const { masterId } = get();
    let masterPath: string | null = null;
    if (masterId?.startsWith("dir:")) { const dir = await masterSource.dir(); masterPath = dir ? `${dir}/${masterId.slice("dir:".length)}` : null; }
    else if (masterId?.startsWith("ws:") || (await ws.backend.exists(MASTER_FILE))) masterPath = MASTER_FILE;
    if (!masterPath) return { ok: false, message: "書き出しにはマスターが必要です。「マスター」から保管フォルダの pptx を選ぶか、フォルダに master.pptx を置いてください。" };
    const r = await ws.backend.runExport(EXPORT_FILE, masterPath, OUTPUT_FILE);
    if (r.code !== 0) return { ok: false, message: `生成に失敗しました (${r.code})。${r.stderr.trim().split("\n").slice(-3).join(" / ")}` };
    const warnings = r.stderr.trim() ? ` 警告: ${r.stderr.trim().split("\n").length}件（${r.stderr.trim().split("\n")[0]}）` : "";
    return { ok: true, message: `${OUTPUT_FILE} を生成しました。${warnings}` };
  },
  onFileChanged: (rel) => {
    if (rel === get().workspace?.deckFile || rel === MASTER_FILE) void get().pollDisk();
    else if (rel.startsWith("images/")) {
      // Drop the cached URL so the preview picks up a regenerated image.
      const { imageUrls } = get();
      if (rel in imageUrls) { const next = { ...imageUrls }; delete next[rel]; set({ imageUrls: next }); }
    }
  },
  };
});

/** Make a workspace the current document: leaves the start screen, then loads its deck file (or writes `scaffold` when it is missing). */
async function adopt(ws: Workspace, scaffold?: string) {
  useDeckStore.setState({ workspace: ws, imageUrls: {}, started: true });
  await useDeckStore.getState().loadFromDisk(scaffold);
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { void useDeckStore.getState().save(); }, 1500);
}

export function useCurrentMaster(): MasterProfile | undefined {
  return useDeckStore((s) => s.masters.find((m) => m.id === s.masterId));
}

export { findLayout };
