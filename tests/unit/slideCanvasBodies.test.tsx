import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SlideCanvas } from "../../src/components/SlideCanvas";
import { importMaster, type MasterProfile } from "../../src/master/importMaster";
import { parseMarkdown } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";

const MD = "---\ntitle: T\nagenda: once\n---\n\n# 章\n\n## 比較 {layout=2col}\n- 左\n\n- 右\n";
const sample = () => importMaster(new Blob([readFileSync("examples/sample-master.pptx")]), "sample");
const regions = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".region")];

describe("SlideCanvas draws text into the boxes the exporter fills (ADR-0023)", () => {
  it("puts the agenda into the largest body box even when a caption box comes first", async () => {
    const m = await sample();
    const agenda = m.layouts.find((l) => l.role?.kind === "agenda")!;
    const content = agenda.placeholders.find((p) => p.type === "obj" || p.type === "body")!;
    const caption = { ...content, type: "body", idx: 9, rect: { ...content.rect!, w: content.rect!.w / 4 } };
    const master: MasterProfile = { ...m, layouts: m.layouts.map((l) => (l === agenda ? { ...l, placeholders: [caption, ...l.placeholders] } : l)) };
    const slide = renderDeck(parseMarkdown(MD)).find((s) => s.kind === "agenda")!;
    const { container } = render(<SlideCanvas slide={slide} master={master} />);
    expect(parseFloat(regions(container)[1].style.width)).toBeCloseTo((content.rect!.w / m.slideSize.w) * 100, 3);
  });

  it("draws two columns with Body-2col, and both in the one body box when the master has no Body-2col", async () => {
    const m = await sample();
    const slide = renderDeck(parseMarkdown(MD)).find((s) => s.kind === "body")!;
    const two = render(<SlideCanvas slide={slide} master={m} />);
    const cols = regions(two.container).map((r) => r.textContent ?? "");
    expect(cols).toHaveLength(3);
    expect(cols[1]).toContain("左");
    expect(cols[2]).toContain("右");
    two.unmount();
    const no2col: MasterProfile = { ...m, layouts: m.layouts.filter((l) => !(l.role?.kind === "body" && l.role.layout === "2col")) };
    const one = regions(render(<SlideCanvas slide={slide} master={no2col} />).container).map((r) => r.textContent ?? "");
    expect(one).toHaveLength(2);
    expect(one[1]).toContain("左");
    expect(one[1]).toContain("右");
  });
});
