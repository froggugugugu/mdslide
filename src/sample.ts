// The built-in sample behind "サンプルを見る": a generic engineering status report. Its shape is fixed by the E2E tests
// (chapter and slide titles, and the image placeholder on line 29 where a paste lands); keep those when editing the words.
export const SAMPLE_MARKDOWN = `---
title: CI/CD パイプライン改善 進捗報告
subtitle: 2026年 第3四半期 定例
author: プラットフォームチーム
agenda: once
numbering: chapter
---

# 背景と目的

## 取り組みの背景

- CI の待ち時間が長く、1 回の変更を出すまでに半日かかることがある
- 不安定なテストが再実行を招き、失敗の原因が追えない
- デプロイと切り戻しの手順が担当者の記憶に依存している

## 目的とゴール {img=1/2 side=right}

- 「速さ」「安定性」「運用の手間」を四半期ごとに数字で確認する
- 個人の評価には使わず、チームの改善に使う
- 今期のゴール: CI 15 分以内、変更障害率 10% 未満

![改善サイクルの全体像](images/overview.png)

# 現在の状況

## パイプラインの構成 {img=3/4 side=left}

![TODO 構成図]()

> note: 構成図は AI に生成させた後で貼り付ける

## 今四半期の進捗

- テストの並列実行で CI の中央値を 28 分から 16 分に短縮
- 不安定なテスト 40 件のうち 31 件を修正、残りは隔離して計測中
- デプロイ手順をスクリプト化し、手作業を 12 手順から 3 手順に

---

- 切り戻しの平均時間を 45 分から 12 分に短縮
- 次回定例でダッシュボードの初版を提示

# 今後の計画

## 次のアクション {layout=2col}

- 10月: 残りの不安定なテストを修正
- 11月: プレビュー環境の自動作成
- 12月: 四半期レビューと目標の見直し

- 承認事項: CI ランナーの増強
- 相談事項: 週末デプロイの原則禁止

## 指標の定義

| 指標 | 定義 | 取得元 |
|---|---|---|
| CI 所要時間 | プッシュから結果通知までの中央値 | CI のログ |
| 不安定なテスト | 同じコミットで結果が変わるテストの件数 | テストレポート |
| 変更障害率 | 障害を伴ったデプロイの割合 | 障害管理表 |
`;
