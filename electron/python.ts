import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import path from "node:path";

/** What the app found for the pptx exporter (tools/export_pptx.py): a Python that can import python-pptx, or why not. */
export interface PythonCheck {
  ok: boolean;
  /** The Python used for export: the first with python-pptx, else the first that runs. */
  python?: string;
  version?: string;
  /** python-pptx version, when it imports. */
  pptx?: string;
  /**
   * no-python: nothing runs. needs-clt: only macOS's /usr/bin/python3, which needs the Command Line Tools first.
   * no-pptx: a Python runs but cannot import python-pptx.
   */
  problem?: "no-python" | "needs-clt" | "no-pptx";
  /** mdslide's own virtual environment (next to settings.json). It is searched first; the instructions create it. */
  venv: string;
  /** Pythons actually run during the check, in order. */
  tried: string[];
}

export interface PythonSearch {
  env: Record<string, string | undefined>;
  home: string;
  /** Folder of settings.json. */
  configDir: string;
  /** settings.json export.python: an explicit choice. */
  configured?: string | null;
  platform: string;
}

/** Where to look, in order. An explicit choice (MDSLIDE_PYTHON, then the setting) is the only candidate. */
export function pythonCandidates(s: PythonSearch): string[] {
  const explicit = s.env.MDSLIDE_PYTHON?.trim() || s.configured?.trim();
  if (explicit) return [explicit];
  const out: string[] = [];
  const add = (p: string) => { if (!out.includes(p)) out.push(p); };
  add(path.join(s.configDir, "venv", "bin", "python3"));
  for (const dir of (s.env.PATH ?? "").split(path.delimiter).filter(Boolean)) add(path.join(dir, "python3"));
  // An app started from Finder gets a minimal PATH, so also look where Python usually lives on a Mac.
  if (s.platform === "darwin") {
    for (const dir of ["/opt/homebrew/bin", "/usr/local/bin", "/Library/Frameworks/Python.framework/Versions/Current/bin", path.join(s.home, ".pyenv", "shims"), "/usr/bin"]) add(path.join(dir, "python3"));
  }
  return out;
}

export interface PythonProbe { version: string; pptx: string | null }
export interface PythonDeps {
  exists(file: string): Promise<boolean>;
  probe(python: string): Promise<PythonProbe | null>;
  hasCommandLineTools(): Promise<boolean>;
}

const PROBE = [
  "import json, sys",
  "try:",
  "    import pptx",
  "    v = pptx.__version__",
  "except Exception:",
  "    v = None",
  "print(json.dumps({'version': '%d.%d.%d' % sys.version_info[:3], 'pptx': v}))",
].join("\n");

function run(file: string, args: string[], timeout: number): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? "") }));
  });
}

export const systemDeps: PythonDeps = {
  exists: async (file) => { try { await access(file, constants.X_OK); return true; } catch { return false; } },
  probe: async (python) => {
    const r = await run(python, ["-c", PROBE], 15000);
    if (!r.ok) return null;
    try {
      const d = JSON.parse(r.stdout.trim().split("\n").pop() ?? "") as { version?: unknown; pptx?: unknown };
      return { version: String(d.version), pptx: typeof d.pptx === "string" ? d.pptx : null };
    } catch { return null; }
  },
  hasCommandLineTools: async () => (await run("/usr/bin/xcode-select", ["-p"], 5000)).ok,
};

/**
 * Find a Python that can run the exporter. On a Mac without the Command Line Tools, /usr/bin/python3 is only a stub that
 * opens the system installer when it is run, so it is not run at all then (ADR-0019).
 */
export async function checkPython(s: PythonSearch, deps: PythonDeps = systemDeps): Promise<PythonCheck> {
  const venv = path.join(s.configDir, "venv");
  const tried: string[] = [];
  let working: { python: string; version: string } | undefined;
  let needsClt = false;
  for (const c of pythonCandidates(s)) {
    if (path.isAbsolute(c) && !(await deps.exists(c))) continue;
    if (s.platform === "darwin" && c === "/usr/bin/python3" && !(await deps.hasCommandLineTools())) { needsClt = true; continue; }
    tried.push(c);
    const p = await deps.probe(c);
    if (!p) continue;
    if (p.pptx) return { ok: true, python: c, version: p.version, pptx: p.pptx, venv, tried };
    working ??= { python: c, version: p.version };
  }
  if (working) return { ok: false, problem: "no-pptx", ...working, venv, tried };
  return { ok: false, problem: needsClt ? "needs-clt" : "no-python", venv, tried };
}
