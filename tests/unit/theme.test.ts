import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importMaster, parseTheme } from "../../src/master/importMaster";
import { themeJson } from "../../src/workspace/bootstrap";

describe("theme extraction", () => {
  it("reads the colour scheme and fonts from theme1.xml", () => {
    const xml = `<a:theme xmlns:a="x"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/><a:font script="Jpan" typeface="ＭＳ Ｐゴシック"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:font script="Jpan" typeface="ＭＳ Ｐゴシック"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
    const t = parseTheme(xml);
    expect(t.name).toBe("Office");
    expect(t.colors).toEqual({ dk1: "#000000", lt1: "#FFFFFF", dk2: "#1F497D", lt2: "#EEECE1", accent1: "#4F81BD", accent2: "#C0504D", accent3: "#9BBB59", accent4: "#8064A2", accent5: "#4BACC6", accent6: "#F79646" });
    expect(t.fonts).toEqual({ major: "Calibri", minor: "Calibri", majorJa: "ＭＳ Ｐゴシック", minorJa: "ＭＳ Ｐゴシック" });
  });
  it("is attached to imported masters and serialised for the workspace", async () => {
    const m = await importMaster(new Blob([readFileSync("examples/sample-master.pptx")]), "s");
    expect(m.theme?.colors.accent1).toBe("#4F81BD");
    const json = JSON.parse(themeJson(m));
    expect(json.colors.accent1).toBe("#4F81BD");
    expect(json.palette).toEqual(["#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6", "#F79646"]);
    expect(json.text).toBe("#000000"); expect(json.background).toBe("#FFFFFF");
    expect(json.source).toBe("master.pptx");
    const fallback = JSON.parse(themeJson(undefined));
    expect(fallback.palette).toHaveLength(6); expect(fallback.source).toBe("default");
  });
});
