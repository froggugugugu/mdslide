import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme, isDark, onAppearanceChange, THEMES } from "../../src/settings/appearance";
import { settings } from "../../src/settings/settings";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete (window as { mdslide?: unknown }).mdslide;
  settings.update((v) => { v.appearance.theme = "auto"; });
});

describe("appearance", () => {
  it("offers auto / light / dark", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["auto", "light", "dark"]);
  });
  it("stamps the choice on <html> and forwards it to Electron when the bridge exists", () => {
    const setTheme = vi.fn(async (_theme: string) => undefined);
    (window as unknown as { mdslide: { setTheme: typeof setTheme } }).mdslide = { setTheme };
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(isDark()).toBe(true);
    applyTheme("light");
    expect(isDark()).toBe(false);
    applyTheme("auto");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(isDark()).toBe(false); // the test environment reports a light system scheme
    expect(setTheme.mock.calls.map((c) => c[0])).toEqual(["dark", "light", "auto"]);
  });
  it("works without the bridge and notifies only when the effective scheme changes", () => {
    const cb = vi.fn();
    const off = onAppearanceChange(cb);
    settings.update((v) => { v.editor.width = 400; }); // unrelated setting: still light
    expect(cb).not.toHaveBeenCalled();
    applyTheme("dark"); settings.update((v) => { v.appearance.theme = "dark"; });
    expect(cb).toHaveBeenCalledTimes(1);
    settings.update((v) => { v.editor.width = 410; }); // still dark: no second call
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    applyTheme("light"); settings.update((v) => { v.appearance.theme = "light"; });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
