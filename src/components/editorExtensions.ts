import { EditorView, keymap } from "@codemirror/view";
import { EditorSelection, Prec } from "@codemirror/state";
import { autocompletion, snippetCompletion, startCompletion, type CompletionContext } from "@codemirror/autocomplete";
import { Vim } from "@replit/codemirror-vim";
import { useDeckStore } from "../store/deckStore";
import { sanitize } from "../workspace/workspace";

const HEADING_LINE = /^#{1,2}\s/;

/** Title of the nearest heading at or above `pos`, with its number if any, for naming pasted images. */
export function imageBaseName(view: EditorView, pos: number): string {
  const doc = view.state.doc;
  let n = doc.lineAt(pos).number;
  for (; n >= 1; n--) {
    const t = doc.line(n).text;
    const m = t.match(/^#{1,2}\s+(.*?)\s*(\{[^}]*\})?\s*$/);
    if (m) {
      const slide = useDeckStore.getState().slides.find((s) => s.sourceLine === n - 1);
      return sanitize(`${slide?.number ? slide.number + "-" : ""}${m[1]}`);
    }
  }
  return `image-${Date.now().toString(36)}`;
}

/** Insert an image reference on its own line at the cursor. Replaces a "![alt]()" placeholder on that line if present. */
export function insertImage(view: EditorView, rel: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const ph = line.text.match(/!\[([^\]]*)\]\(\)/);
  if (ph) {
    const start = line.from + ph.index!;
    view.dispatch({ changes: { from: start, to: start + ph[0].length, insert: `![${ph[1].replace(/^TODO\s*/i, "")}](${rel})` } });
    return;
  }
  const alt = rel.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
  const doc = view.state.doc;
  const next = line.number < doc.lines ? doc.line(line.number + 1).text : "";
  // Keep one blank line on each side of the image reference.
  const prefix = line.text.trim() === "" ? "" : "\n\n";
  const suffix = next.trim() === "" ? "" : "\n"; // the line's own newline supplies the second break
  const insert = `${prefix}![${alt}](${rel})${suffix}`;
  const at = line.text.trim() === "" ? line.from : line.to;
  view.dispatch({ changes: { from: at, to: line.text.trim() === "" ? line.to : line.to, insert }, selection: EditorSelection.cursor(at + prefix.length + `![${alt}](${rel})`.length) });
}

async function handleImageFiles(view: EditorView, files: File[]): Promise<boolean> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (!images.length) return false;
  const base = imageBaseName(view, view.state.selection.main.from);
  for (const f of images) {
    const rel = await useDeckStore.getState().pasteImage(f, images.length > 1 ? sanitize(f.name.replace(/\.\w+$/, "")) : base);
    insertImage(view, rel);
  }
  return true;
}

/** Clipboard (screenshots) and file drops become files under images/ plus a markdown reference. */
export const imageDropPaste = EditorView.domEventHandlers({
  paste(e, view) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.some((f) => f.type.startsWith("image/"))) return false;
    e.preventDefault();
    void handleImageFiles(view, files).catch((err) => alert(err instanceof Error ? err.message : String(err)));
    return true;
  },
  drop(e, view) {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.some((f) => f.type.startsWith("image/"))) return false;
    e.preventDefault();
    let pos: number | null = null;
    try { pos = view.posAtCoords({ x: e.clientX, y: e.clientY }); } catch { /* no layout (tests) */ }
    if (pos !== null) view.dispatch({ selection: EditorSelection.cursor(pos) });
    void handleImageFiles(view, files).catch((err) => alert(err instanceof Error ? err.message : String(err)));
    return true;
  },
});

/** Snippets: type ":" then Ctrl-Space (or just Ctrl-Space) to pick a block template. */
const SNIPPETS = [
  snippetCompletion("## ${タイトル}\n\n- ${}\n", { label: ":body", detail: "本文スライド" }),
  snippetCompletion("# ${章タイトル}\n\n", { label: ":section", detail: "章（中表紙）" }),
  snippetCompletion("## ${タイトル} {layout=2col}\n\n- ${左}\n\n- ${右}\n", { label: ":2col", detail: "2カラム" }),
  snippetCompletion("## ${タイトル} {img=1/2 side=right}\n\n- ${}\n\n![TODO ${図の説明}]()\n", { label: ":img", detail: "画像右 1/2（後で貼り付け）" }),
  snippetCompletion("## ${タイトル} {img=1/1}\n\n![TODO ${図の説明}]()\n", { label: ":imgfull", detail: "画像全幅" }),
  snippetCompletion("| ${項目} | ${値} |\n|---|---|\n| ${} |  |\n", { label: ":table", detail: "表" }),
  snippetCompletion("> note: ${}\n", { label: ":note", detail: "スピーカーノート" }),
  snippetCompletion("---\n\n", { label: ":split", detail: "明示的なページ分割" }),
];

export function snippetSource(ctx: CompletionContext) {
  const word = ctx.matchBefore(/:\w*/);
  if (!word && !ctx.explicit) return null;
  return { from: word ? word.from : ctx.pos, options: SNIPPETS, validFor: /^:\w*$/ };
}

export const snippets = [
  autocompletion({ override: [snippetSource], activateOnTyping: false, icons: false }),
  Prec.highest(keymap.of([{ key: "Ctrl-Space", run: startCompletion }])),
];

/** ]] / [[ jump to the next / previous slide heading, Vim style. */
export function jumpHeading(view: EditorView, dir: 1 | -1): boolean {
  const doc = view.state.doc;
  let n = doc.lineAt(view.state.selection.main.head).number + dir;
  for (; n >= 1 && n <= doc.lines; n += dir) {
    if (HEADING_LINE.test(doc.line(n).text)) {
      const pos = doc.line(n).from;
      view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: "center" }) });
      return true;
    }
  }
  return false;
}

let vimMapped = false;
export function registerVimMotions() {
  if (vimMapped) return;
  vimMapped = true;
  Vim.defineAction("mdslideNextHeading", (cm: { cm6: EditorView }) => { jumpHeading(cm.cm6, 1); });
  Vim.defineAction("mdslidePrevHeading", (cm: { cm6: EditorView }) => { jumpHeading(cm.cm6, -1); });
  Vim.mapCommand("]]", "action", "mdslideNextHeading", {}, { context: "normal" });
  Vim.mapCommand("[[", "action", "mdslidePrevHeading", {}, { context: "normal" });
  // :w saves deck.md
  Vim.defineEx("write", "w", () => { void useDeckStore.getState().save(true); });
}

export const saveKeymap = Prec.highest(keymap.of([{ key: "Mod-s", run: () => { void useDeckStore.getState().save(true); return true; } }]));

/** ⌘/ (help) and ⌘I (drafts) are the app's shortcuts (App.tsx): keep CodeMirror's toggleComment and selectParentSyntax off them. */
export const appShortcuts = Prec.highest(keymap.of([{ key: "Mod-/", run: () => true }, { key: "Mod-i", run: () => true }]));
