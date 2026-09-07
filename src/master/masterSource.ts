import { settings } from "../settings/settings";
import { isElectron } from "../workspace/workspace";

/**
 * Where master pptx files come from (ADR-0013). On the desktop this is one folder
 * (settings masters.dir, default ~/.config/mdslide/masters) managed like any other files;
 * the browser build and tests keep them in memory. A deck picks one by name in its frontmatter.
 */
export interface MasterEntry { name: string; modified: number }

export interface MasterSource {
  kind: "dir" | "memory";
  /** Absolute folder shown to the person; null when there is no folder (memory). */
  dir(): Promise<string | null>;
  list(): Promise<MasterEntry[]>;
  read(name: string): Promise<Blob | null>;
  /** Desktop: pick a pptx and copy it into the folder. Memory: add the given file. Returns the stored name. */
  add(file?: File): Promise<string | null>;
  /** Store bytes under a name (the bundled sample). Overwrites; callers check for an existing name first. */
  addBlob(name: string, blob: Blob): Promise<string>;
  remove(name: string): Promise<void>;
  /** Desktop only: pick another folder and remember it in the settings. */
  chooseDir?(): Promise<string | null>;
  /** Desktop only: show the folder in Finder. */
  reveal?(): Promise<void>;
}

const isMaster = (name: string) => /\.(pptx|potx)$/i.test(name);

export function electronMasterSource(): MasterSource {
  const api = window.mdslide!;
  const resolve = () => api.mastersResolve(settings.get().masters.dir);
  return {
    kind: "dir",
    dir: resolve,
    list: async () => {
      const dir = await resolve();
      const names = (await api.list(dir)).filter(isMaster).sort();
      const out: MasterEntry[] = [];
      for (const name of names) out.push({ name, modified: (await api.modified(`${dir}/${name}`)) ?? 0 });
      return out;
    },
    read: async (name) => { const r = await api.readFile(`${await resolve()}/${name}`); return r ? new Blob([r.data as BlobPart]) : null; },
    add: async () => api.importMaster(await resolve()),
    addBlob: async (name, blob) => { await api.writeFile(`${await resolve()}/${name}`, new Uint8Array(await blob.arrayBuffer())); return name; },
    remove: async (name) => api.remove(`${await resolve()}/${name}`),
    chooseDir: async () => {
      const dir = await api.openFolder();
      if (dir) settings.update((v) => { v.masters.dir = dir; });
      return dir;
    },
    reveal: async () => api.showItem(await resolve()),
  };
}

export function memoryMasterSource(): MasterSource {
  const files = new Map<string, Blob>();
  return {
    kind: "memory",
    dir: async () => null,
    list: async () => [...files.keys()].sort().map((name) => ({ name, modified: 0 })),
    read: async (name) => files.get(name) ?? null,
    add: async (file) => { if (!file) return null; files.set(file.name, file); return file.name; },
    addBlob: async (name, blob) => { files.set(name, blob); return name; },
    remove: async (name) => { files.delete(name); },
  };
}

export const masterSource: MasterSource = isElectron ? electronMasterSource() : memoryMasterSource();
