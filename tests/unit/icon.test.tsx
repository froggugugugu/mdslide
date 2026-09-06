import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES, type IconName } from "../../src/components/Icon";

describe("Icon", () => {
  it("renders every named icon as a decorative svg drawn with currentColor", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("data-icon")).toBe(name);
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.querySelector("path, rect, circle")).not.toBeNull();
      unmount();
    }
  });
  it("renders nothing for an unknown name and honours the size", () => {
    const { container } = render(<Icon name={"nope" as IconName} />);
    expect(container.innerHTML).toBe("");
    const { container: c2 } = render(<Icon name="doc" size={20} />);
    expect(c2.querySelector("svg")?.getAttribute("width")).toBe("20");
  });
});
