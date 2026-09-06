import { describe, expect, it, vi } from "vitest";

describe("master source (memory: browser build and tests)", () => {
  it("adds, lists sorted by name, reads and removes", async () => {
    vi.resetModules();
    delete (window as { mdslide?: unknown }).mdslide;
    const { masterSource } = await import("../../src/master/masterSource");
    expect(masterSource.kind).toBe("memory");
    expect(await masterSource.dir()).toBeNull();
    expect(await masterSource.add(new File(["bb"], "b.pptx"))).toBe("b.pptx");
    expect(await masterSource.add(new File(["a"], "a.pptx"))).toBe("a.pptx");
    expect((await masterSource.list()).map((e) => e.name)).toEqual(["a.pptx", "b.pptx"]);
    expect((await masterSource.read("b.pptx"))!.size).toBe(2);
    await masterSource.remove("a.pptx");
    expect((await masterSource.list()).map((e) => e.name)).toEqual(["b.pptx"]);
    expect(await masterSource.read("a.pptx")).toBeNull();
    expect(await masterSource.add()).toBeNull(); // nothing to add without a file
  });
});

describe("master source (electron: a folder of pptx files)", () => {
  it("resolves the folder from settings, lists pptx files, imports and removes through the main process", async () => {
    vi.resetModules();
    const files = new Map<string, string>([["/cfg/masters/corp.pptx", "CC"], ["/cfg/masters/notes.txt", "x"]]);
    const api = {
      platform: "darwin",
      mastersResolve: vi.fn(async (dir: string | null) => dir ?? "/cfg/masters"),
      importMaster: vi.fn(async (dir: string) => { files.set(`${dir}/new.pptx`, "N"); return "new.pptx"; }),
      list: vi.fn(async (p: string) => [...files.keys()].filter((k) => k.startsWith(p + "/")).map((k) => k.slice(p.length + 1))),
      modified: vi.fn(async (p: string) => files.has(p) ? 7 : null),
      readFile: vi.fn(async (p: string) => files.has(p) ? { data: new TextEncoder().encode(files.get(p)!), modified: 7 } : null),
      remove: vi.fn(async (p: string) => { files.delete(p); }),
      openFolder: vi.fn(async () => "/other/masters"),
      showItem: vi.fn(async () => undefined),
      settingsPath: async () => "", settingsRead: async () => null, settingsWrite: async () => undefined,
    };
    (window as unknown as { mdslide: typeof api }).mdslide = api;
    const { masterSource } = await import("../../src/master/masterSource");
    const { settings } = await import("../../src/settings/settings");
    expect(masterSource.kind).toBe("dir");
    expect(await masterSource.dir()).toBe("/cfg/masters");
    expect(await masterSource.list()).toEqual([{ name: "corp.pptx", modified: 7 }]); // only pptx/potx
    expect((await masterSource.read("corp.pptx"))!.size).toBe(2);
    expect(await masterSource.add()).toBe("new.pptx");
    expect(api.importMaster).toHaveBeenCalledWith("/cfg/masters");
    await masterSource.remove("corp.pptx");
    expect(api.remove).toHaveBeenCalledWith("/cfg/masters/corp.pptx");
    expect(await masterSource.chooseDir!()).toBe("/other/masters");
    expect(settings.get().masters.dir).toBe("/other/masters");
    expect(await masterSource.dir()).toBe("/other/masters"); // the configured folder is what gets resolved from now on
    delete (window as { mdslide?: unknown }).mdslide;
  });
});
