/** Fixed prompts sent to the CLI agent running in the console. One line each: the terminal delivers them as one message. */
export interface PromptTemplate { id: string; label: string; hint: string; text: string }

export const PROMPTS: PromptTemplate[] = [
  { id: "format", label: "整形して deck.md に", hint: "notes/ の口語メモをスライドの Markdown に",
    text: "notes/ にあるメモ（参照を付けたファイル）を読んで、AGENTS.md の規約に従い deck.md をスライド資料として整形してください。章立て（#）と本文スライド（##）に分け、1スライドは短い箇条書き 3〜6 行、口語は書き言葉に直し、内容は足さず削らず。既存の deck.md があれば構成を尊重して差し替えてください。図が必要な箇所は ![TODO 図の説明]() と書いてください。" },
  { id: "figures", label: "図を統一テーマで生成", hint: "TODO の図を theme.json の配色で PNG に",
    text: "deck.md の ![TODO ...]() を実際の図に置き換えてください。theme.json の配色とフォントで統一し、tools/mdslide_draw.py（flow / venn / pillars / cycle / matrix / timeline）で描けるものはそれで、それ以外は同じ theme.json の色だけを使った matplotlib か PIL の短いスクリプトで images/ に PNG（1600px 幅、16:9 か 4:3）を出力し、deck.md の参照を ![説明](images/名前.png) に書き換えてください。文字は 22pt 以上、スライド 1 枚に図は 1 つまで。" },
  { id: "restyle", label: "テーマで描き直し", hint: "既存の図を theme.json に合わせて描き直す",
    text: "images/ にある図のうち deck.md で参照されているものを、theme.json の配色・フォントに合わせて描き直してください（同じファイル名で上書き）。描き方は tools/mdslide_draw.py か theme.json の色だけを使う matplotlib / PIL。内容は変えず、見た目だけ統一してください。" },
  { id: "summarize", label: "要約", hint: "notes/ を 5 行に要約してエグゼクティブサマリのスライドに",
    text: "notes/ のメモ（参照を付けたファイル）を読み、要点を 5 行以内に要約して、deck.md の先頭の章の直後に「## サマリー」スライドとして追加してください。AGENTS.md の規約に従い、数字と固有名詞は落とさないでください。" },
  { id: "outline", label: "章立て提案", hint: "メモから章構成だけを提案（本文は書かない）",
    text: "notes/ のメモ（参照を付けたファイル）を読んで、報告資料としての章立て（# 章 と ## スライドの見出しだけ）を 3 案提案し、それぞれ狙いを 1 行で添えてください。deck.md はまだ書き換えないでください。私が選んだ案で整形を頼みます。" },
];

/**
 * Append note references (Claude Code style @path) and, when given, the slide the person is looking at.
 * Templates are written for deck.md; `deckFile` substitutes the workspace's actual file name.
 */
export function buildPrompt(id: string, notes: string[], slideRef?: string | null, deckFile = "deck.md"): string {
  const p = PROMPTS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown prompt ${id}`);
  const refs = notes.map((n) => `@${n}`).join(" ");
  const parts = [p.text.replaceAll("deck.md", deckFile).replace(/\s+/g, " ").trim()];
  if (refs) parts.push(`参照: ${refs}`);
  if (slideRef) parts.push(`今見ているスライド: ${slideRef}`);
  return parts.join(" ");
}
