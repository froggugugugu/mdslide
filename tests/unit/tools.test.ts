import { beforeEach, describe, expect, it } from "vitest";
import { commandLine, PRESET_TOOLS, useToolsStore } from "../../src/console/toolsStore";
import { settings } from "../../src/settings/settings";

describe("CLI tool presets", () => {
  beforeEach(async () => { localStorage.clear(); await settings.load(); useToolsStore.getState().reset(); });

  it("ships well-known agents assuming they are on PATH, Claude Code first", () => {
    expect(PRESET_TOOLS[0]).toMatchObject({ id: "claude", name: "Claude Code", command: "claude" });
    for (const id of ["codex", "gemini", "aider", "copilot"]) expect(PRESET_TOOLS.some((t) => t.id === id)).toBe(true);
    expect(useToolsStore.getState().tools.map((t) => t.id)).toEqual(PRESET_TOOLS.map((t) => t.id));
    expect(useToolsStore.getState().selectedId).toBe("claude");
  });
  it("builds the command line with args and no trailing space", () => {
    expect(commandLine({ id: "x", name: "x", command: "claude", args: "" })).toBe("claude");
    expect(commandLine({ id: "x", name: "x", command: "aider", args: "--model sonnet " })).toBe("aider --model sonnet");
  });
  it("adds, edits, removes custom tools and persists", async () => {
    const s = useToolsStore.getState();
    const id = s.add({ name: "My tool", command: "mytool", args: "--fast" })!;
    expect(useToolsStore.getState().tools.at(-1)).toEqual({ id, name: "My tool", command: "mytool", args: "--fast" });
    useToolsStore.getState().update(id, { args: "" });
    expect(useToolsStore.getState().tools.at(-1)!.args).toBe("");
    useToolsStore.getState().select(id);
    expect(useToolsStore.getState().selectedId).toBe(id);
    expect(settings.get().tools.selectedId).toBe(id);
    expect(settings.get().tools.items.map((t) => t.id)).toEqual([id]); // presets at defaults are not written
    useToolsStore.getState().remove(id);
    expect(useToolsStore.getState().tools.some((t) => t.id === id)).toBe(false);
    expect(useToolsStore.getState().selectedId).toBe("claude"); // selection falls back
    // survives a reload of the settings file
    useToolsStore.getState().update("codex", { args: "--full-auto" });
    await settings.flush();
    await settings.load();
    expect(useToolsStore.getState().tools.find((t) => t.id === "codex")!.args).toBe("--full-auto");
    expect(settings.get().tools.items.find((t) => t.id === "codex")).toEqual({ id: "codex", name: "Codex CLI", command: "codex", args: "--full-auto" });
  });
  it("presets can be edited but not removed, and restored to defaults", () => {
    useToolsStore.getState().update("claude", { command: "/opt/claude" });
    useToolsStore.getState().remove("claude");
    expect(useToolsStore.getState().tools[0].command).toBe("/opt/claude");
    useToolsStore.getState().restoreDefaults();
    expect(useToolsStore.getState().tools[0].command).toBe("claude");
    expect(useToolsStore.getState().tools).toHaveLength(PRESET_TOOLS.length);
  });
  it("ignores an empty command on add", () => {
    expect(useToolsStore.getState().add({ name: "", command: "  ", args: "" })).toBeNull();
    expect(useToolsStore.getState().tools).toHaveLength(PRESET_TOOLS.length);
  });
});
