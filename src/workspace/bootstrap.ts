import drawSource from "../../tools/mdslide_draw.py?raw";
import { ensureAgentFiles } from "../console/agentsMd";
import type { MasterProfile } from "../master/importMaster";
import type { Backend } from "./workspace";

type Fs = Pick<Backend, "exists" | "writeText" | "readText">;

const DEFAULT_PALETTE = ["#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#FF453A"];

/** theme.json: what figure generators need, derived from the master's theme1.xml. */
export function themeJson(master: MasterProfile | undefined): string {
  const t = master?.theme;
  const c = t?.colors ?? {};
  const palette = t ? [1, 2, 3, 4, 5, 6].map((i) => c[`accent${i}`]).filter((x): x is string => !!x) : [];
  const doc = {
    source: t ? "master.pptx" : "default",
    name: t?.name ?? "mdslide default",
    palette: palette.length ? palette : DEFAULT_PALETTE,
    text: c.dk1 ?? "#1D1D1F",
    background: c.lt1 ?? "#FFFFFF",
    dark2: c.dk2 ?? "#3A3A3C",
    light2: c.lt2 ?? "#F2F2F7",
    muted: "#8E8E93",
    fonts: { major: t?.fonts.major ?? "Helvetica", minor: t?.fonts.minor ?? "Helvetica", majorJa: t?.fonts.majorJa ?? "Hiragino Sans", minorJa: t?.fonts.minorJa ?? "Hiragino Sans" },
    colors: c,
    figure: { width_px: 1600, aspect: "16:9", min_font_pt: 22, background: "transparent" },
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

async function writeIfDifferent(fs: Fs, rel: string, text: string): Promise<boolean> {
  const cur = await fs.readText(rel);
  if (cur?.text === text) return false;
  await fs.writeText(rel, text);
  return true;
}

/**
 * Files an AI agent needs to work in the folder:
 *   AGENTS.md            conventions for any agent (written once; the person may edit it)
 *   CLAUDE.md            "@AGENTS.md": Claude Code imports the same conventions (written once)
 *   theme.json           palette/fonts from master.pptx (kept in sync with the master)
 *   tools/mdslide_draw.py theme-aware figure helpers (kept in sync with the app)
 *   notes/               inbox for raw material
 */
export async function bootstrapWorkspace(fs: Fs & { list?: Backend["list"] }, master: MasterProfile | undefined, deckFile = "deck.md"): Promise<{ agents: boolean; claude: boolean; theme: boolean; draw: boolean }> {
  const { agents, claude } = await ensureAgentFiles(fs, deckFile);
  const theme = await writeIfDifferent(fs, "theme.json", themeJson(master));
  const draw = await writeIfDifferent(fs, "tools/mdslide_draw.py", drawSource);
  if (!(await fs.exists("notes/.keep"))) await fs.writeText("notes/.keep", "");
  return { agents, claude, theme, draw };
}
