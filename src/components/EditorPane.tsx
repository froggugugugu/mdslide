import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Theme-aware markdown colors; everything resolves through CSS variables so light/dark both work. */
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "600", color: "var(--ink)" },
  { tag: t.processingInstruction, color: "var(--ink-3)" },
  { tag: t.contentSeparator, color: "var(--ink-3)" },
  { tag: t.meta, color: "var(--ink-3)" },
  { tag: t.quote, color: "var(--ink-2)", fontStyle: "italic" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--accent)", opacity: "0.8" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.monospace, color: "var(--ink-2)" },
  { tag: t.comment, color: "var(--ink-3)" },
]);
import { vim } from "@replit/codemirror-vim";
import { settings } from "../settings/settings";
import { useDeckStore } from "../store/deckStore";
import { imageDropPaste, registerVimMotions, saveKeymap, snippets } from "./editorExtensions";
import { guides, setGuides } from "./editorGuides";

/** Vim is a setting (editor.vim); the compartment swaps it in and out without rebuilding the editor. */
const vimMode = new Compartment();
const vimExtension = (on: boolean) => (on ? vim() : []);

export function EditorPane() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const setMarkdown = useDeckStore((s) => s.setMarkdown);
  const selectByLine = useDeckStore((s) => s.selectByLine);
  const version = useDeckStore((s) => s.externalEditVersion);
  const gotoLine = useDeckStore((s) => s.gotoLine);
  const slides = useDeckStore((s) => s.slides);
  const selectedId = useDeckStore((s) => s.selectedId);
  const clearGoto = useDeckStore((s) => s.clearGoto);
  const applying = useRef(false);

  useEffect(() => {
    if (!host.current) return;
    registerVimMotions();
    const state = EditorState.create({
      doc: useDeckStore.getState().markdown,
      extensions: [
        vimMode.of(vimExtension(settings.get().editor.vim)), // must precede basicSetup so Vim owns the keys
        syntaxHighlighting(highlight),
        basicSetup,
        markdown(),
        saveKeymap,
        snippets,
        imageDropPaste,
        guides,
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !applying.current) setMarkdown(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const line = u.state.doc.lineAt(u.state.selection.main.head).number - 1;
            selectByLine(line);
          }
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    let vimOn = settings.get().editor.vim;
    const unsubscribe = settings.subscribe((s) => {
      if (s.editor.vim === vimOn) return;
      vimOn = s.editor.vim;
      view.current?.dispatch({ effects: vimMode.reconfigure(vimExtension(vimOn)) });
    });
    return () => { unsubscribe(); view.current?.destroy(); view.current = null; };
  }, [setMarkdown, selectByLine]);

  // Guides follow the rendered deck (fit, splits) and the selection.
  useEffect(() => {
    view.current?.dispatch({ effects: setGuides.of({ slides, selectedId }) });
  }, [slides, selectedId]);

  // Store-originated edits (reorder, layout change): replace the document, keep the cursor sane.
  useEffect(() => {
    const v = view.current;
    if (!v || version === 0) return;
    const next = useDeckStore.getState().markdown;
    if (v.state.doc.toString() === next) return;
    // Place the cursor on the selected block's heading so selection-by-cursor keeps the moved slide selected.
    const { slides, selectedId } = useDeckStore.getState();
    const line = slides.find((s) => s.id === selectedId)?.sourceLine ?? 0;
    applying.current = true;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } });
    const pos = v.state.doc.line(Math.min(line + 1, v.state.doc.lines)).from;
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    applying.current = false;
  }, [version]);

  // Thumbnail click: scroll editor to the block's heading.
  useEffect(() => {
    const v = view.current;
    if (!v || gotoLine === null) return;
    const line = v.state.doc.line(Math.min(gotoLine + 1, v.state.doc.lines));
    v.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 24 }) });
    clearGoto();
  }, [gotoLine, clearGoto]);

  return <div ref={host} className="h-full" style={{ background: "var(--panel)" }} />;
}
