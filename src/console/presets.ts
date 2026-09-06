/** A CLI agent that can be launched in the console. Presets assume the command is on PATH. */
export interface CliTool { id: string; name: string; command: string; args: string }

export const PRESET_TOOLS: CliTool[] = [
  { id: "claude", name: "Claude Code", command: "claude", args: "" },
  { id: "codex", name: "Codex CLI", command: "codex", args: "" },
  { id: "gemini", name: "Gemini CLI", command: "gemini", args: "" },
  { id: "aider", name: "Aider", command: "aider", args: "" },
  { id: "copilot", name: "GitHub Copilot CLI", command: "copilot", args: "" },
  { id: "cursor", name: "Cursor Agent", command: "cursor-agent", args: "" },
  { id: "opencode", name: "OpenCode", command: "opencode", args: "" },
];
