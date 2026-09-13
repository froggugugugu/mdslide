import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AllowedPaths } from "../../electron/paths";

function tree() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "mdslide-paths-")));
  const ws = path.join(base, "ws");
  mkdirSync(path.join(ws, "images"), { recursive: true });
  const secret = path.join(base, "secret");
  mkdirSync(secret);
  writeFileSync(path.join(secret, "key.txt"), "x");
  mkdirSync(path.join(base, "ws2"));
  return { base, ws, secret };
}

describe("AllowedPaths (ADR-0026)", () => {
  it("allows the opened folder, files in it and paths not created yet", async () => {
    const { ws } = tree();
    const a = new AllowedPaths();
    a.allow(ws);
    expect(await a.allows(ws)).toBe(true);
    expect(await a.allows(path.join(ws, "deck.md"))).toBe(true);
    expect(await a.allows(path.join(ws, "out", "new", "deck.pptx"))).toBe(true);
  });
  it("refuses other folders, a sibling sharing the prefix, climbing out and relative paths", async () => {
    const { base, ws, secret } = tree();
    const a = new AllowedPaths();
    a.allow(ws);
    for (const p of [secret, path.join(secret, "key.txt"), path.join(base, "ws2", "x"), path.join(ws, "..", "secret", "key.txt"), "deck.md", "", 42 as unknown as string]) {
      expect(await a.allows(p), String(p)).toBe(false);
    }
  });
  it("follows symbolic links, so a link inside the folder cannot reach outside", async () => {
    const { ws, secret } = tree();
    symlinkSync(secret, path.join(ws, "images", "link"));
    const a = new AllowedPaths();
    a.allow(ws);
    expect(await a.allows(path.join(ws, "images", "link", "key.txt"))).toBe(false);
    // a link to a file that does not exist yet: writing through it would create the file outside
    symlinkSync(path.join(secret, "new.txt"), path.join(ws, "dangling"));
    expect(await a.allows(path.join(ws, "dangling"))).toBe(false);
  });
  it("accepts a folder given through a link, and an allowed file only as itself", async () => {
    const { base, ws } = tree();
    const alias = path.join(base, "alias");
    symlinkSync(ws, alias);
    const settingsFile = path.join(base, "settings.json");
    writeFileSync(settingsFile, "{}");
    const a = new AllowedPaths();
    for (const p of [alias, settingsFile, null, undefined, "relative/dir"]) a.allow(p);
    expect(await a.allows(path.join(ws, "deck.md"))).toBe(true);
    expect(await a.allows(settingsFile)).toBe(true);
    expect(await a.allows(path.join(base, "other.json"))).toBe(false);
    expect(await a.allows(path.resolve("relative/dir/x"))).toBe(false);
  });
});
