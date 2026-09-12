import { describe, expect, it } from "vitest";
import { checkPython, pythonCandidates, type PythonDeps, type PythonProbe } from "../../electron/python";

const base = { env: { PATH: "/usr/bin:/bin:/opt/homebrew/bin" }, home: "/Users/me", configDir: "/Users/me/.config/mdslide", platform: "darwin" };
const VENV = "/Users/me/.config/mdslide/venv";

describe("pythonCandidates", () => {
  it("looks in mdslide's own venv, then PATH, then the usual places on a Mac, without duplicates", () => {
    expect(pythonCandidates(base)).toEqual([
      `${VENV}/bin/python3`, "/usr/bin/python3", "/bin/python3", "/opt/homebrew/bin/python3",
      "/usr/local/bin/python3", "/Library/Frameworks/Python.framework/Versions/Current/bin/python3", "/Users/me/.pyenv/shims/python3",
    ]);
    expect(pythonCandidates({ ...base, platform: "linux" })).toEqual([`${VENV}/bin/python3`, "/usr/bin/python3", "/bin/python3", "/opt/homebrew/bin/python3"]);
  });
  it("an explicit choice is the only candidate: MDSLIDE_PYTHON first, then the setting; blank means automatic", () => {
    expect(pythonCandidates({ ...base, configured: "/opt/py/bin/python3" })).toEqual(["/opt/py/bin/python3"]);
    expect(pythonCandidates({ ...base, env: { ...base.env, MDSLIDE_PYTHON: "python3.12" }, configured: "/opt/py/bin/python3" })).toEqual(["python3.12"]);
    expect(pythonCandidates({ ...base, configured: "   " })[0]).toBe(`${VENV}/bin/python3`);
  });
});

function deps(o: { files: string[]; probes: Record<string, PythonProbe>; clt?: boolean }) {
  const probed: string[] = [];
  const d: PythonDeps = {
    exists: async (f) => o.files.includes(f),
    probe: async (p) => { probed.push(p); return o.probes[p] ?? null; },
    hasCommandLineTools: async () => o.clt ?? true,
  };
  return { d, probed };
}

describe("checkPython", () => {
  it("uses the first Python that can import python-pptx", async () => {
    const { d } = deps({
      files: ["/usr/bin/python3", "/opt/homebrew/bin/python3"],
      probes: { "/usr/bin/python3": { version: "3.9.6", pptx: null }, "/opt/homebrew/bin/python3": { version: "3.13.1", pptx: "1.0.2" } },
    });
    expect(await checkPython(base, d)).toEqual({ ok: true, python: "/opt/homebrew/bin/python3", version: "3.13.1", pptx: "1.0.2", venv: VENV, tried: ["/usr/bin/python3", "/opt/homebrew/bin/python3"] });
  });
  it("reports a Python without python-pptx, naming the first one that runs", async () => {
    const { d } = deps({ files: ["/usr/bin/python3"], probes: { "/usr/bin/python3": { version: "3.9.6", pptx: null } } });
    expect(await checkPython(base, d)).toMatchObject({ ok: false, problem: "no-pptx", python: "/usr/bin/python3", version: "3.9.6", venv: VENV });
  });
  it("never runs macOS's python3 stub without the Command Line Tools, since that would open the installer", async () => {
    const { d, probed } = deps({ files: ["/usr/bin/python3"], probes: {}, clt: false });
    expect(await checkPython(base, d)).toEqual({ ok: false, problem: "needs-clt", venv: VENV, tried: [] });
    expect(probed).toEqual([]);
  });
  it("reports no Python at all, and runs a bare explicit command without looking for the file", async () => {
    expect(await checkPython(base, deps({ files: [], probes: {} }).d)).toMatchObject({ ok: false, problem: "no-python", tried: [] });
    const { d } = deps({ files: [], probes: { "python3.12": { version: "3.12.4", pptx: "1.0.2" } } });
    expect(await checkPython({ ...base, env: { ...base.env, MDSLIDE_PYTHON: "python3.12" } }, d)).toMatchObject({ ok: true, python: "python3.12", tried: ["python3.12"] });
  });
});
