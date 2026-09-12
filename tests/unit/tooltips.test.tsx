import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tooltips } from "../../src/components/Tooltips";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup() {
  vi.useFakeTimers();
  render(
    <>
      <button data-tip="保存 (⌘S)">保存</button>
      <button data-tip="設定 (⌘,)" aria-label="設定"><span data-testid="icon">*</span></button>
      <div data-testid="plain">plain</div>
      <Tooltips delay={400} />
    </>,
  );
  return { save: screen.getByText("保存"), gear: screen.getByRole("button", { name: "設定" }), icon: screen.getByTestId("icon") };
}
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const tooltip = () => screen.queryByRole("tooltip");

describe("Tooltips", () => {
  it("shows a control's hint after the delay, keeps it while the pointer is on the control's icon, and hides on leave", () => {
    const { save, gear, icon } = setup();
    vi.spyOn(save, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 120, left: 200, width: 40, height: 20 } as DOMRect);
    fireEvent.mouseOver(save);
    expect(tooltip()).toBeNull();                                  // not at once
    wait(400);
    expect(tooltip()).toHaveTextContent("保存 (⌘S)");
    expect(tooltip()!.style.top).toBe("126px");                    // under the control
    fireEvent.mouseOut(save, { relatedTarget: icon });
    fireEvent.mouseOver(icon);                                     // straight on to the next control: shown at once
    expect(tooltip()).toHaveTextContent("設定 (⌘,)");
    fireEvent.mouseOut(icon, { relatedTarget: gear });             // from the icon to its own button: stays
    expect(tooltip()).toHaveTextContent("設定 (⌘,)");
    fireEvent.mouseOut(gear, { relatedTarget: document.body });
    expect(tooltip()).toBeNull();
    fireEvent.mouseOver(screen.getByTestId("plain"));              // no data-tip: nothing
    wait(1000);
    expect(tooltip()).toBeNull();
  });

  it("a click or a scroll hides the hint and the next one waits for the delay again", () => {
    const { save, gear } = setup();
    fireEvent.mouseOver(gear); wait(400);
    expect(tooltip()).not.toBeNull();
    fireEvent.mouseDown(gear);
    expect(tooltip()).toBeNull();
    fireEvent.mouseOut(gear, { relatedTarget: save });
    fireEvent.mouseOver(save);
    expect(tooltip()).toBeNull();                                  // cooled down by the click
    wait(400);
    expect(tooltip()).toHaveTextContent("保存 (⌘S)");
    fireEvent.scroll(window);
    expect(tooltip()).toBeNull();
  });

  it("shows on keyboard focus, not on focus from a click, and hides on blur", () => {
    const { save } = setup();
    fireEvent.mouseOver(save); fireEvent.mouseDown(save); fireEvent.focusIn(save); wait(400);
    expect(tooltip()).toBeNull();                                  // focus that came with a click shows nothing
    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.focusIn(save); wait(400);
    expect(tooltip()).toHaveTextContent("保存 (⌘S)");
    fireEvent.focusOut(save);
    expect(tooltip()).toBeNull();
  });
});
