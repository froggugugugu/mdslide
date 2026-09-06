# ADR-0012 メモから資料へ：下書き（notes/）、定型プロンプト、テーマ図、履歴

## 状況
口語のメモや元資料を AI に渡してスライドにし、統一テーマの挿絵まで作らせ、結果をエディタとプレビューで直したい。

## 決定
- 材料は `notes/` に置く。下書きドロワー（⌘I）の本文は自動保存、ファイルはどこにドロップしても `notes/` へ。
- AI への指示はコンソールで動いている CLI ツールに定型プロンプトを流し込む（`src/console/prompts.ts`：整形・図生成・描き直し・要約・章立て提案）。Claude Code の `@path` 参照でチェックしたメモを添付。
- 図は PNG。配色とフォントは `master.pptx` の theme1.xml から `theme.json` に書き出し、`tools/mdslide_draw.py`（flow / venn / pillars / cycle / matrix / timeline、matplotlib）を各フォルダに配布して AI に使わせる。描けないものは theme.json の色だけで matplotlib / PIL。
- 指示を送る直前に `deck.md` を `.mdslide/history/` にスナップショット。「前の版に戻す」は入れ替え式で、もう一度押せば取り消せる。
- 送信はツールが起動していることが前提（起動していなければ通知）。端末の中身は見えないので、ツール起動の有無は pty の有無で判定する。

## 結果
- Claude Code 以外のツールでも同じプロンプトが使える。
- matplotlib が追加依存になる（`pip install matplotlib`）。
- 図の品質はヘルパの範囲に依存する。種類を増やすときは `tools/mdslide_draw.py` と `tests/python/test_draw.py` を両方更新する。
