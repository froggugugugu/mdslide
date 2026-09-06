/** In-memory File System Access API subset, enough for the browser backend and the store. */
export class FakeFileHandle {
  kind = "file" as const;
  constructor(public name: string, public data: Uint8Array | string = "", public lastModified = Date.now()) {}
  async getFile(): Promise<File> {
    return new File([this.data as BlobPart], this.name, { lastModified: this.lastModified });
  }
  async createWritable() {
    const self = this;
    let buf: Uint8Array | string = "";
    return {
      async write(chunk: string | Blob | Uint8Array) {
        buf = typeof chunk === "string" ? chunk : chunk instanceof Blob ? new Uint8Array(await chunk.arrayBuffer()) : chunk;
      },
      async close() { self.data = buf; self.lastModified = Date.now() + 1; },
    };
  }
}

export class FakeDirHandle {
  kind = "directory" as const;
  entries = new Map<string, FakeDirHandle | FakeFileHandle>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDirHandle> {
    const e = this.entries.get(name);
    if (e instanceof FakeDirHandle) return e;
    if (!opts?.create) throw new DOMException("NotFound", "NotFoundError");
    const d = new FakeDirHandle(name); this.entries.set(name, d); return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFileHandle> {
    const e = this.entries.get(name);
    if (e instanceof FakeFileHandle) return e;
    if (!opts?.create) throw new DOMException("NotFound", "NotFoundError");
    const f = new FakeFileHandle(name); this.entries.set(name, f); return f;
  }
  async queryPermission() { return "granted" as PermissionState; }
  async requestPermission() { return "granted" as PermissionState; }
  /** Test helper: write a file as if an external process did it. */
  put(path: string, data: string | Uint8Array, modified = Date.now() + 10) {
    const parts = path.split("/"); let dir: FakeDirHandle = this;
    for (const p of parts.slice(0, -1)) { let d = dir.entries.get(p); if (!(d instanceof FakeDirHandle)) { d = new FakeDirHandle(p); dir.entries.set(p, d); } dir = d; }
    const name = parts[parts.length - 1];
    const f = dir.entries.get(name) as FakeFileHandle | undefined;
    if (f) { f.data = data; f.lastModified = modified; } else dir.entries.set(name, new FakeFileHandle(name, data, modified));
  }
  text(path: string): string | null {
    const parts = path.split("/"); let dir: FakeDirHandle = this;
    for (const p of parts.slice(0, -1)) { const d = dir.entries.get(p); if (!(d instanceof FakeDirHandle)) return null; dir = d; }
    const f = dir.entries.get(parts[parts.length - 1]);
    if (!(f instanceof FakeFileHandle)) return null;
    return typeof f.data === "string" ? f.data : new TextDecoder().decode(f.data);
  }
  list(path = ""): string[] {
    let dir: FakeDirHandle = this;
    for (const p of path.split("/").filter(Boolean)) { const d = dir.entries.get(p); if (!(d instanceof FakeDirHandle)) return []; dir = d; }
    return [...dir.entries.keys()];
  }
}

export function installFakePicker(root: FakeDirHandle) {
  (window as unknown as { showDirectoryPicker: () => Promise<FakeDirHandle> }).showDirectoryPicker = async () => root;
}
