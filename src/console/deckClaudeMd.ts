/** Conventions dropped into the workspace as CLAUDE.md so an interactive Claude Code session edits deck.md correctly. */
export const DECK_CLAUDE_MD = `# このフォルダについて（mdslide）

このフォルダはスライド資料です。唯一の正は \`deck.md\`、画像は \`images/\`、書式は \`master.pptx\`。
\`deck.md\` を編集すると mdslide が即座に再表示します。別の Markdown ファイルは作らないでください。

## deck.md の規約

- 先頭の frontmatter: \`title\` \`subtitle\` \`author\` \`date\`、\`agenda: once|per-section|none\`、\`numbering: chapter|flat|none\`
- \`# 章タイトル\` = 章（中表紙）。アジェンダの項目にもなる
- \`## タイトル\` = 本文スライド
- 章番号・スライド番号は書かない。ツールが導出する
- 本文内の \`---\` は明示的なページ分割
- レイアウトは見出し末尾の属性: \`{layout=2col}\`、画像は \`{img=1/1|3/4|1/2 side=left|right}\`
- 画像: \`![説明](images/name.png)\`。まだ無い図は \`![TODO 説明]()\` と書く（人が後で貼る）
- \`> note: 本文\` はスピーカーノート
- Markdown の表はパワポのネイティブ表になる
- 箇条書きは 2 スペース字下げで階層
- 1 スライドは 12 行程度まで。溢れるなら分割する

## 材料（notes/）

- \`notes/\` には口語のメモや元資料（txt / md / docx / pdf / 画像 / pptx）が入る。整形の指示ではここを読む
- 口語は書き言葉に。内容は足さず削らず。数字と固有名詞は落とさない
- 1 スライドは短い箇条書き 3〜6 行。長ければスライドを分ける

## 図（images/）

- 配色とフォントは \`theme.json\` に従う。\`palette\` 以外の色を使わない。背景は透明
- まず \`python3 tools/mdslide_draw.py <flow|venn|pillars|cycle|matrix|timeline> images/名前.png ...\` で描けるか考える（\`--help\` で使い方）
- 描けないものは theme.json の色だけを使った短い matplotlib / PIL スクリプトで PNG を出力（1600px 幅、16:9 か 4:3、文字は 22pt 以上）
- ファイル名は内容が分かる英数字（\`images/flow-improvement.png\`）。deck.md からは \`![説明](images/名前.png)\` で参照
- 1 スライドに図は 1 つ。図で説明できる内容は本文を減らす

## 作業の流れ

- 指示された範囲だけを編集し、他のスライドは触らない
- deck.md を書き換える前の版は mdslide が \`.mdslide/history/\` に取っている。気にせず上書きしてよい
- 変更内容は短く報告する
`;

export async function ensureDeckClaudeMd(backend: { exists(rel: string): Promise<boolean>; writeText(rel: string, text: string): Promise<number> }): Promise<boolean> {
  if (await backend.exists("CLAUDE.md")) return false;
  await backend.writeText("CLAUDE.md", DECK_CLAUDE_MD);
  return true;
}
