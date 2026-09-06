# ADR-0003 pptx 生成は deck.json 契約を介して python-pptx で行う

## 状況
pptxgenjs はテーマを引き継げない。ブラウザ内で OOXML を直接生成する方法は正確だが実装量が大きい。

## 決定
- アプリは `deck.json`（契約 v1）を書き出す。生成は `tools/export_pptx.py` が取り込んだマスター pptx を母体に python-pptx で行う。
- 契約を安定させ、将来 JS 単体実装（テンプレクローン）に差し替え可能にする。

## 結果
- テーマ・フォント・ロゴが 100% 維持される。
- 生成には Python 環境が必要（Tauri 化で内蔵する案は backlog）。
