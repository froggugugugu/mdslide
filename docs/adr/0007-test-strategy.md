# ADR-0007 テスト戦略：4 層とカバレッジ閾値

## 状況
初期実装はモデル層のみテストがあり、UI・ストア・Electron・Python は手動確認だった。品質を数字で保ちたい。

## 決定
- 単体（vitest + jsdom + Testing Library）、内部結合（store を実体で回す）、Python（pytest、in-process 実行でカバレッジ計測）、E2E（Web は OPFS 代替、Electron は実アプリ＋CDP）の 4 層。
- E2E は Python（pytest-playwright）で書く。理由：Python は pptx 生成で既に必須、Playwright の Node 版は Electron 起動に別途ブラウザ配布が要る。
- カバレッジ閾値を CI で強制（lines 80% / branches 70%）。
- ここからは TDD。振る舞いの変更はテストの変更から始める。

## 結果
- 現状：vitest 59 テスト、lines 97.9% / branches 88%。Python 7 テスト、90%。E2E Web 4 本、Electron 1 本。
- テストで見つかった不具合 3 件を修正：`Title Only` 等のレイアウト名を表紙と誤判定、壊れた master.pptx で起動が止まる、前回フォルダが開けないと起動が止まる。
