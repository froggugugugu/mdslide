/**
 * The scaffold for a deck created from the start screen: a frame, not content.
 * Title from the file name (or the folder name when the file is the default deck.md), today's date, one chapter with one
 * slide. The built-in sample stays behind "サンプルを見る".
 */
export function newDeckTemplate(deckFile: string, now = new Date(), folderName?: string): string {
  const stem = deckFile.replace(/\.(md|markdown)$/i, "");
  const title = stem && stem !== "deck" ? stem : folderName?.trim() || "資料タイトル";
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `---\ntitle: ${title}\ndate: ${date}\nagenda: once\nnumbering: chapter\n---\n\n# 章タイトル\n\n## スライドタイトル\n\n- 要点\n`;
}
