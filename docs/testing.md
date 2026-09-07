# テスト方針

| 層 | 場所 | 実行 | 何を保証するか |
|---|---|---|---|
| 単体 | `tests/unit/` | `npm test` | parser / render / geometry / importMaster / workspace / editor 拡張 / 各コンポーネント |
| 内部結合 | `tests/integration/` | `npm test` | store を通した Markdown→スライド→保存の一連、フォルダ監視と競合、Electron ブリッジ経由の書き出し |
| Python | `tests/python/` | `npm run test:py` | deck.json v2 → pptx。レイアウト解決、画像内接、表、ノート、警告、失敗時のメッセージ |
| E2E（Web） | `tests/e2e/test_web.py` | `npm run test:e2e` | ビルド済みレンダラを headless Chromium で操作。フォルダは OPFS で代替 |
| E2E（Electron） | `tests/e2e/test_electron.py` | `npm run test:e2e:electron` | 実アプリを起動し CDP で操作。argv 起動、chokidar、Python 生成まで |

## 基準
- カバレッジ閾値（`vitest.config.ts`）: lines/statements/functions 80%、branches 70%。下回ると `test:coverage` が失敗する。
- Python は `--cov=tools` で 85% 以上を目安。
- 機能追加は「モデル/ストアのテストを先に赤で書く → 実装 → 緑」。UI はコンポーネントテストで操作結果（Markdown の変化）を確認する。
- E2E は「ユーザーが実際に行う一連の操作」単位で書く。細かい分岐は単体に落とす。

## 環境
- Node 24.15 以上、Python 3.12、`pip install -r requirements-dev.txt` と `python -m playwright install chromium`。バージョンは `requirements*.txt` と `package.json` で完全一致に固定している（更新は Dependabot の PR 経由）。
- Electron E2E は表示が必要。Linux では Xvfb を自動起動、macOS はそのまま動く。

## jsdom の制約
- `Blob` は IndexedDB の structured clone で中身を失う。Blob の永続化は E2E で検証する。
- CodeMirror の計測 API（`Range.getClientRects`）は `tests/setup.ts` でスタブする。

## 端末の手動確認（本物の `claude`）
1. `claude --version` が通る Mac で `npm run dev`、フォルダを開く
2. コンソールに `claude` が自動で立ち上がる（立ち上がらない場合は「claude を起動」）
3. 「3章にリスク一覧の表を追加して」→ 左ペインに新スライドが現れる
4. `npm run rebuild` が失敗した環境では、コンソールバーのメタ情報と `pty:backend` で `host` にフォールバックしていることを確認
