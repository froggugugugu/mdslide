import { create } from "zustand";
import type { PythonCheck } from "../../electron/python";

export type { PythonCheck };

interface PythonState {
  /** Latest result of the check; null until it has run (and always in the browser build). */
  check: PythonCheck | null;
  checking: boolean;
  /** The launch banner was closed for this session. */
  dismissed: boolean;
  run: () => Promise<PythonCheck | null>;
  dismiss: () => void;
}

/** Whether this Mac can write pptx: checked at launch, from the settings, and after an export fails for want of Python. */
export const usePythonStore = create<PythonState>((set) => ({
  check: null, checking: false, dismissed: false,
  run: async () => {
    const api = typeof window !== "undefined" ? window.mdslide : undefined;
    if (!api?.checkPython) return null;
    set({ checking: true });
    try { const check = await api.checkPython(); set({ check }); return check; }
    catch { return null; }
    finally { set({ checking: false }); }
  },
  dismiss: () => set({ dismissed: true }),
}));

const quote = (p: string) => (/[\s'"$`\\]/.test(p) ? `"${p.replace(/(["$`\\])/g, "\\$1")}"` : p);

/** Commands for the install instructions. The venv follows the settings folder, which is where the app looks first. */
export function installCommands(check: PythonCheck | null): { tools: string; venv: string[]; user: string } {
  const venv = check?.venv ?? "~/.config/mdslide/venv";
  const q = (p: string) => (p.startsWith("~") ? p : quote(p));
  return {
    tools: "xcode-select --install",
    venv: [`python3 -m venv ${q(venv)}`, `${q(`${venv}/bin/python`)} -m pip install python-pptx`],
    user: "python3 -m pip install --user python-pptx",
  };
}
