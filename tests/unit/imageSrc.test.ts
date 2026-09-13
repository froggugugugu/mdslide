import { describe, expect, it } from "vitest";
import { imageSource } from "../../src/model/imageSrc";

describe("imageSource (ADR-0026)", () => {
  it("reads relative paths inside the deck folder, normalized", () => {
    expect(imageSource("images/a.png")).toEqual({ kind: "file", path: "images/a.png" });
    expect(imageSource("./images/../images//a.png")).toEqual({ kind: "file", path: "images/a.png" });
    expect(imageSource("図/構成 (1).png")).toEqual({ kind: "file", path: "図/構成 (1).png" });
  });
  it("refuses paths that leave the folder or start from the root of a disk", () => {
    for (const src of ["../x.png", "images/../../x.png", "/Users/me/Pictures/a.jpg", "\\\\server\\share\\a.png", "C:\\Users\\a.png", "C:/Users/a.png"]) {
      expect(imageSource(src), src).toEqual({ kind: "outside" });
    }
  });
  it("never loads URLs; inline data: images are shown as they are", () => {
    for (const src of ["https://example.com/a.png", "http://example.com/a.png", "file:///etc/a.png", "blob:file:///x", "javascript:alert(1)", "data:text/html,<b>x</b>"]) {
      expect(imageSource(src), src).toEqual({ kind: "external" });
    }
    expect(imageSource("data:image/png;base64,AAAA")).toEqual({ kind: "data" });
  });
});
