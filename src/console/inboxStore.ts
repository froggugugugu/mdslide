import { create } from "zustand";
import type { Backend } from "../workspace/workspace";
import { sanitize } from "../workspace/workspace";

type Fs = Pick<Backend, "list" | "writeText" | "writeBlob" | "exists" | "remove" | "readText">;
const DIR = "notes";

/** Notes that can be opened in the drawer's editor. Everything else (docx, pdf, images, pptx) is only listed and passed on. */
export const isTextNote = (rel: string): boolean => /\.(md|markdown|txt|csv|json|ya?ml|log)$/i.test(rel);

export function noteFileName(d: Date, ext: string): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DIR}/${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

interface InboxState {
  open: boolean;
  notes: string[];
  draft: string;
  /** The note file the current draft is saved to (created on first save). */
  draftFile: string | null;
  saving: boolean;
  toggle: () => void;
  refresh: (fs: Fs) => Promise<void>;
  setDraft: (text: string) => void;
  flush: (fs: Fs) => Promise<void>;
  newDraft: () => void;
  /** Load a text note into the editor so it can be checked and edited; the draft in progress is saved first. false: not text, or unreadable. */
  openNote: (fs: Fs, rel: string) => Promise<boolean>;
  dropFiles: (fs: Fs, files: File[]) => Promise<string[]>;
  remove: (fs: Fs, rel: string) => Promise<void>;
  reset: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingFs: Fs | null = null;

export const useInboxStore = create<InboxState>((set, get) => ({
  open: false, notes: [], draft: "", draftFile: null, saving: false,
  toggle: () => set({ open: !get().open }),
  refresh: async (fs) => {
    const names = (await fs.list(DIR)).filter((n) => !n.startsWith(".")).sort();
    set({ notes: names.map((n) => `${DIR}/${n}`) });
  },
  setDraft: (text) => {
    set({ draft: text });
    if (timer) clearTimeout(timer);
    if (pendingFs) timer = setTimeout(() => { void get().flush(pendingFs!); }, 1500);
  },
  flush: async (fs) => {
    pendingFs = fs;
    if (timer) { clearTimeout(timer); timer = null; }
    const { draft } = get();
    if (!draft.trim()) return;
    const file = get().draftFile ?? noteFileName(new Date(), "md");
    set({ saving: true, draftFile: file });
    await fs.writeText(file, draft);
    set({ saving: false });
    await get().refresh(fs);
  },
  newDraft: () => set({ draft: "", draftFile: null }),
  openNote: async (fs, rel) => {
    if (!isTextNote(rel)) return false;
    await get().flush(fs);
    const r = await fs.readText(rel);
    if (!r) return false;
    if (timer) { clearTimeout(timer); timer = null; }
    set({ draft: r.text, draftFile: rel });
    return true;
  },
  dropFiles: async (fs, files) => {
    const saved: string[] = [];
    for (const f of files) {
      const dot = f.name.lastIndexOf(".");
      const base = sanitize(dot > 0 ? f.name.slice(0, dot) : f.name) || "file";
      const ext = dot > 0 ? f.name.slice(dot + 1).toLowerCase() : "";
      let name = ext ? `${base}.${ext}` : base;
      for (let i = 2; await fs.exists(`${DIR}/${name}`); i++) name = ext ? `${base}-${i}.${ext}` : `${base}-${i}`;
      await fs.writeBlob(`${DIR}/${name}`, f);
      saved.push(`${DIR}/${name}`);
    }
    await get().refresh(fs);
    return saved;
  },
  remove: async (fs, rel) => { await fs.remove(rel); if (get().draftFile === rel) set({ draft: "", draftFile: null }); await get().refresh(fs); },
  reset: () => { if (timer) clearTimeout(timer); timer = null; pendingFs = null; set({ open: false, notes: [], draft: "", draftFile: null, saving: false }); },
}));

/** Register the backend used by the debounced autosave. */
export function attachInboxFs(fs: Fs | null) { pendingFs = fs; }
