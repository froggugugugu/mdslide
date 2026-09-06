import { describe, expect, it } from "vitest";
import { getMasterFile, listMasters, removeMaster, saveMaster } from "../../src/master/masterStore";
import type { MasterProfile } from "../../src/master/importMaster";

const profile = (id: string, at: string): MasterProfile => ({ id, name: id, importedAt: at, slideSize: { w: 1, h: 1 }, layouts: [], unmapped: [], missing: [] });

describe("masterStore", () => {
  it("saves, lists newest first, returns the file, removes", async () => {
    await saveMaster(profile("a", "2026-01-01"), new Blob(["A"]));
    await saveMaster(profile("b", "2026-02-01"), new Blob(["B"]));
    expect((await listMasters()).map((m) => m.id)).toEqual(["b", "a"]);
    expect(await getMasterFile("a")).toBeDefined(); // jsdom Blobs do not survive structured clone intact; browsers do (covered by E2E)
    await removeMaster("a");
    expect((await listMasters()).map((m) => m.id)).toEqual(["b"]);
    expect(await getMasterFile("a")).toBeUndefined();
    await removeMaster("b");
  });
});
