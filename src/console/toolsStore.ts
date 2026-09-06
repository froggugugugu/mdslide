import { create } from "zustand";
import { settings } from "../settings/settings";

import { PRESET_TOOLS, type CliTool } from "./presets";
export { PRESET_TOOLS, type CliTool };
const PRESET_IDS = new Set(PRESET_TOOLS.map((t) => t.id));

export const isPreset = (id: string) => PRESET_IDS.has(id);
export const commandLine = (t: CliTool) => `${t.command.trim()} ${t.args.trim()}`.trim();

interface ToolsState {
  tools: CliTool[];
  selectedId: string;
  select: (id: string) => void;
  add: (t: Omit<CliTool, "id">) => string | null;
  update: (id: string, patch: Partial<Omit<CliTool, "id">>) => void;
  remove: (id: string) => void;
  restoreDefaults: () => void;
  reset: () => void;
  selected: () => CliTool;
}

/** Presets always exist (the file only stores overrides), custom tools are appended. */
function load(): { tools: CliTool[]; selectedId: string } {
  const d = settings.get().tools;
  const custom = d.items.filter((t) => !isPreset(t.id));
  const presets = PRESET_TOOLS.map((p) => ({ ...p, ...d.items.find((t) => t.id === p.id) }));
  const tools = [...presets, ...custom];
  const selectedId = tools.some((t) => t.id === d.selectedId) ? d.selectedId : "claude";
  return { tools, selectedId };
}

export const useToolsStore = create<ToolsState>((set, get) => {
  // Only presets that differ from their defaults are written, so the file stays small and readable.
  const persist = (tools: CliTool[], selectedId: string) => {
    const items = tools.filter((t) => { const p = PRESET_TOOLS.find((x) => x.id === t.id); return !p || p.name !== t.name || p.command !== t.command || p.args !== t.args; });
    settings.update((v) => { v.tools = { selectedId, items }; });
    set({ tools, selectedId });
  };
  settings.subscribe(() => set(load()));
  return {
    ...load(),
    select: (id) => { if (get().tools.some((t) => t.id === id)) persist(get().tools, id); },
    add: (t) => {
      if (!t.command.trim()) return null;
      const id = `tool-${Date.now().toString(36)}`;
      persist([...get().tools, { id, name: t.name.trim() || t.command.trim(), command: t.command.trim(), args: t.args ?? "" }], get().selectedId);
      return id;
    },
    update: (id, patch) => persist(get().tools.map((t) => (t.id === id ? { ...t, ...patch } : t)), get().selectedId),
    remove: (id) => {
      if (isPreset(id)) return;
      const tools = get().tools.filter((t) => t.id !== id);
      persist(tools, get().selectedId === id ? "claude" : get().selectedId);
    },
    restoreDefaults: () => persist([...PRESET_TOOLS.map((t) => ({ ...t })), ...get().tools.filter((t) => !isPreset(t.id))], get().selectedId),
    reset: () => set(load()),
    selected: () => get().tools.find((t) => t.id === get().selectedId) ?? get().tools[0],
  };
});
