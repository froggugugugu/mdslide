import { describe, expect, it } from "vitest";
import { capacityLines, charWidthEm, estimateLines, lineWidthEm, splitByFit } from "../../src/model/fit";

describe("text fit model", () => {
  it("measures characters: CJK 1em, Latin narrower, spaces narrow", () => {
    expect(charWidthEm("あ")).toBe(1);
    expect(charWidthEm("Ａ")).toBe(1);   // full-width Latin
    expect(charWidthEm("a")).toBeCloseTo(0.55);
    expect(charWidthEm("W")).toBeCloseTo(0.55);
    expect(charWidthEm(" ")).toBeCloseTo(0.3);
    expect(lineWidthEm("計測 DORA")).toBeCloseTo(2 + 0.3 + 4 * 0.55);
  });
  it("counts wrapped display lines per source line, with bullet indent and empty lines", () => {
    // 20em wide box
    expect(estimateLines(["- 短い"], 20)).toBeCloseTo(1);
    expect(estimateLines(["- " + "あ".repeat(30)], 20)).toBeCloseTo(2); // 30em + bullet indent 1.5em -> 2 lines
    expect(estimateLines(["  - " + "あ".repeat(16)], 20)).toBeCloseTo(1); // nested: 3em indent + 16 = 19 fits
    expect(estimateLines(["  - " + "あ".repeat(18)], 20)).toBeCloseTo(2);
    expect(estimateLines([""], 20)).toBeCloseTo(0.5);
    expect(estimateLines(["a", "", "b"], 20)).toBeCloseTo(2.5);
    expect(estimateLines(["| a | b |", "|---|---|", "| c | d |"], 20)).toBeCloseTo(2); // separator row is free
    expect(estimateLines(["![x](images/x.png)"], 20)).toBe(0); // images are placed separately
  });
  it("derives capacity from box height and font size", () => {
    expect(capacityLines(72 * 4, 18, 1.2)).toBe(Math.floor(288 / 21.6)); // 13
    expect(capacityLines(72 * 4, 24, 1.2)).toBe(10);
    expect(capacityLines(10, 18, 1.2)).toBe(1);
  });
  it("splits at display-line capacity, preferring blank lines and never mid-table", () => {
    const lines = ["- 1", "- 2", "- 3", "", "- 4", "- 5", "- 6", "- 7"];
    const parts = splitByFit(lines, 20, 4.5);
    expect(parts).toEqual([["- 1", "- 2", "- 3"], ["- 4", "- 5", "- 6", "- 7"]]);
    expect(splitByFit(["- a"], 20, 5)).toEqual([["- a"]]);
    const table = ["intro", "| a | b |", "|---|---|", "| 1 | 2 |", "| 3 | 4 |", "| 5 | 6 |"];
    expect(splitByFit(table, 20, 3)).toEqual([["intro"], ["| a | b |", "|---|---|", "| 1 | 2 |", "| 3 | 4 |", "| 5 | 6 |"]]);
    // a long wrapped line counts as several display lines
    expect(splitByFit(["- " + "あ".repeat(50), "- x", "- y"], 20, 4)).toEqual([["- " + "あ".repeat(50), "- x"], ["- y"]]);
  });
});
