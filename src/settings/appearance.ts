import { settings } from "./settings";

/** Light / dark appearance. "auto" follows the system; the CSS tokens use light-dark(), so <html data-theme> is all the page needs. */
export type Theme = "auto" | "light" | "dark";
export const THEMES: { id: Theme; label: string }[] = [{ id: "auto", label: "自動" }, { id: "light", label: "ライト" }, { id: "dark", label: "ダーク" }];

/** Stamp the choice on <html> and tell Electron, so the window chrome and the sidebar vibrancy follow the same scheme. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme; else root.dataset.theme = theme;
  void window.mdslide?.setTheme?.(theme);
}

/** The scheme in effect right now (the forced one, else the system's). Used where CSS cannot decide, e.g. the xterm theme. */
export function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Call cb when the effective scheme changes, whether by the system or by the setting. Returns the unsubscribe function. */
export function onAppearanceChange(cb: () => void): () => void {
  let last = isDark();
  const check = () => { const now = isDark(); if (now !== last) { last = now; cb(); } };
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  mq?.addEventListener("change", check);
  const off = settings.subscribe(check);
  return () => { mq?.removeEventListener("change", check); off(); };
}
