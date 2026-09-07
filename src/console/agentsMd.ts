/**
 * Conventions dropped into a deck folder so an AI agent working there (Claude Code, Codex CLI, Gemini CLI, ...) edits the
 * deck correctly. AGENTS.md is the shared file every tool reads; CLAUDE.md only imports it with Claude Code's `@path`
 * syntax, so there is one set of rules. Both are written once and never overwritten (ADR-0016).
 */
export const AGENTS_FILE = "AGENTS.md";
export const CLAUDE_FILE = "CLAUDE.md";
/** The whole of CLAUDE.md: Claude Code reads AGENTS.md through this import. */
export const CLAUDE_MD_IMPORT = "@AGENTS.md\n";

export function deckAgentsMd(deckFile = "deck.md"): string {
  return `# このフォルダについて（mdslide の資料）

このフォルダは mdslide で作るスライド資料です。唯一の正は \`${deckFile}\` で、mdslide はこのファイルを保存のたびに読み直して表示し、書き出し時に PowerPoint（pptx）にします。
この規約は mdslide が置いたものです。編集してかまいません（mdslide は上書きしません）。\`CLAUDE.md\` は \`@AGENTS.md\` でこのファイルを読み込むだけです。

## フォルダの中身

| パス | 役割 | エージェントは |
| --- | --- | --- |
| \`${deckFile}\` | 資料本体（Markdown）。これだけが正 | 編集する |
| \`images/\` | 図・スクリーンショット。${deckFile} から相対パスで参照 | 追加してよい |
| \`notes/\` | 口語のメモや元資料（txt / md / docx / pdf / 画像 / pptx）。整形の材料 | 読む |
| \`theme.json\` | マスターの配色とフォント。図を描くときの色はここから | 読むだけ |
| \`tools/mdslide_draw.py\` | theme.json に従う図の生成スクリプト | 使う |
| \`master.pptx\` | 書式（任意。無ければ設定のマスター） | 触らない |
| \`deck.json\` \`out/\` \`.mdslide/\` | mdslide の生成物と履歴 | 触らない |

## ${deckFile} の規約

- 先頭の frontmatter（すべて任意）: 表紙に載る \`title\` \`subtitle\` \`author\` \`date\`、\`agenda: once|per-section|none\`（既定 once）、\`numbering: chapter|flat|none\`（既定 chapter）、\`layout: text|2col\`（本文の既定）、\`master: 名前.pptx\`（人が選ぶ。触らない）、\`fontSize: 18\`（本文 pt）、\`imageMaxPx: 2000\`
- \`# 章タイトル\` = 章（中表紙）。アジェンダの項目にもなる
- \`## タイトル\` = 本文スライド。本文は箇条書きが基本（\`- \`、2 スペース字下げで階層）。インラインは \`**太字**\` とバッククォートのコードだけ
- 章番号・スライド番号・ページ数は書かない。mdslide が導出する
- 本文内の \`---\` は明示的なページ分割。溢れたスライドは mdslide が自動で分割するが、まず 1 スライドの量を抑える（短い箇条書き 3〜6 行、多くても 12 行程度）
- 見出し末尾の属性でレイアウトを指定する: \`{layout=2col}\`（最初の空行で左右に分かれる）、画像は \`{img=1/1|3/4|1/2 side=left|right}\`、文字サイズは \`{size=16}\`
- 画像: \`![説明](images/name.png)\`。まだ無い図は \`![TODO 説明]()\` と書く（人が後で貼る）。1 スライドに図は 1 つ
- \`> note: 本文\` はスピーカーノート（スライドには出ない）
- Markdown の表（\`| a | b |\` と \`|---|---|\`）は pptx のネイティブ表になる
- frontmatter と最初の見出しの間の行はメモ扱いで出力されない

## 材料（notes/）から整形するとき

- \`notes/\` の内容を読み、口語は書き言葉に。内容は足さず削らず、数字と固有名詞は落とさない
- 章立て（\`#\`）と本文スライド（\`##\`）に分け、1 スライドは短い箇条書き 3〜6 行
- 既存の ${deckFile} があれば構成を尊重して差し替える。図が必要な箇所は \`![TODO 図の説明]()\`

## 図（images/）

- 配色とフォントは \`theme.json\` に従う。\`palette\` 以外の色を使わない。背景は透明
- まず \`python3 tools/mdslide_draw.py <flow|venn|pillars|cycle|matrix|timeline> images/名前.png ...\` で描けるか考える（\`--help\` で使い方）
- 描けないものは theme.json の色だけを使った短い matplotlib / PIL スクリプトで PNG を出力（1600px 幅、16:9 か 4:3、文字は 22pt 以上）
- ファイル名は内容が分かる英数字（\`images/flow-improvement.png\`）。${deckFile} からは \`![説明](images/名前.png)\` で参照
- 図で説明できる内容は本文を減らす

## 作業の流れ

- 指示された範囲だけを編集し、他のスライドは触らない。別の Markdown ファイルは作らない
- 保存すると mdslide が即座に再表示する。書き換える前の版は mdslide が \`.mdslide/history/\` に取っているので、気にせず上書きしてよい
- 変更内容は短く報告する（どのスライドを、どう変えたか）
`;
}

/** The conventions for the default file name. */
export const DECK_AGENTS_MD = deckAgentsMd();

/** Write AGENTS.md and the CLAUDE.md that imports it, each only when missing. A person's own files are never overwritten. */
export async function ensureAgentFiles(
  backend: { exists(rel: string): Promise<boolean>; writeText(rel: string, text: string): Promise<number> },
  deckFile = "deck.md",
): Promise<{ agents: boolean; claude: boolean }> {
  const agents = !(await backend.exists(AGENTS_FILE));
  if (agents) await backend.writeText(AGENTS_FILE, deckAgentsMd(deckFile));
  const claude = !(await backend.exists(CLAUDE_FILE));
  if (claude) await backend.writeText(CLAUDE_FILE, CLAUDE_MD_IMPORT);
  return { agents, claude };
}
