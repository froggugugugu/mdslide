import { describe, expect, it } from "vitest";
import { chooseFormat, fitSize, processImage, DEFAULT_MAX_PX } from "../../src/model/imageProcess";

describe("image processing on paste", () => {
  it("scales the long edge down to the limit, never up", () => {
    expect(fitSize(3200, 1800, 2000)).toEqual({ w: 2000, h: 1125 });
    expect(fitSize(1000, 3000, 2000)).toEqual({ w: 667, h: 2000 });
    expect(fitSize(800, 600, 2000)).toEqual({ w: 800, h: 600 });
    expect(fitSize(3200, 1800, 0)).toEqual({ w: 3200, h: 1800 }); // 0 disables
    expect(DEFAULT_MAX_PX).toBe(2000);
  });
  it("keeps screenshots as PNG and turns photo-like images into JPEG", () => {
    expect(chooseFormat({ sampled: 4000, unique: 300, srcType: "image/png" })).toBe("image/png");
    expect(chooseFormat({ sampled: 4000, unique: 3500, srcType: "image/png" })).toBe("image/jpeg");
    expect(chooseFormat({ sampled: 4000, unique: 300, srcType: "image/jpeg" })).toBe("image/jpeg"); // already lossy: stay JPEG
    expect(chooseFormat({ sampled: 4000, unique: 3500, srcType: "image/png", hasAlpha: true })).toBe("image/png"); // transparency needs PNG
    expect(chooseFormat({ sampled: 4000, unique: 3500, srcType: "image/gif" })).toBe("image/gif"); // animated/gif untouched
  });
  it("keeps the original bytes when no resize is needed and re-encoding would not shrink it", async () => {
    // Simulate a Chromium-like environment with a fake bitmap/canvas pipeline.
    const g = globalThis as unknown as { createImageBitmap?: unknown; OffscreenCanvas?: unknown };
    const png = new Blob([new Uint8Array(100)], { type: "image/png" });
    let encoded = 500;
    let pixels: Uint8ClampedArray = new Uint8ClampedArray(4 * 16).fill(255);
    g.createImageBitmap = async () => ({ width: 8, height: 2, close() {} });
    g.OffscreenCanvas = class { constructor(public w: number, public h: number) {} getContext() { return { drawImage() {}, getImageData: () => ({ data: pixels }) }; } async convertToBlob(o: { type: string }) { return new Blob([new Uint8Array(encoded)], { type: o.type }); } };
    let r = await processImage(png, { maxPx: 2000 });
    expect(r.changed).toBe(false); expect(r.blob).toBe(png); expect(r.width).toBe(8);
    // photo-like pixels -> JPEG, but only if smaller
    pixels = new Uint8ClampedArray(Array.from({ length: 64 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256))); // opaque, many colours
    r = await processImage(png, { maxPx: 2000 });
    expect(r.changed).toBe(false);        // 500 bytes JPEG > 100 bytes original
    encoded = 40;
    r = await processImage(png, { maxPx: 2000 });
    expect(r.changed).toBe(true); expect(r.type).toBe("image/jpeg");
    // a resize always wins, even if the bytes grow
    encoded = 5000;
    g.createImageBitmap = async () => ({ width: 4000, height: 1000, close() {} });
    r = await processImage(png, { maxPx: 2000 });
    expect(r.changed).toBe(true); expect(r.width).toBe(2000); expect(r.height).toBe(500);
    delete g.createImageBitmap; delete g.OffscreenCanvas;
  });
  it("returns the original blob when the browser cannot decode (no canvas in jsdom)", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const out = await processImage(blob, { maxPx: 2000 });
    expect(out.blob).toBe(blob);
    expect(out.changed).toBe(false);
  });
});
