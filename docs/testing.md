# テスト方針

| 層 | 場所 | 実行 | 何を保証するか |
|---|---|---|---|
| 単体 | `tests/unit/` | `npm test` | parser / render / geometry / dnd / fit・boxes / importMaster / workspace / settings・外観 / editor 拡張 / 各コンポーネント / `electron/python.ts` の探索順 |
| 内部結合 | `tests/integration/` | `npm test` | store を通した Markdown→スライド→保存の一連、フォルダ監視と競合、Electron ブリッジ経由の書き出し |
| Python | `tests/python/` | `npm run test:py` | deck.json v2 → pptx。レイアウト解決、画像内接、表、ノート、警告、失敗時のメッセージ。`tools/mdslide_draw.py` の図。`scripts/install.sh`(macOS のみ): 隔離属性を付けずに入れる、署名が合わなければ入れない、入れ替え |
| E2E（Web） | `tests/e2e/test_web.py` | `npm run test:e2e` | ビルド済みレンダラを headless Chromium で操作。フォルダは OPFS で代替 |
| E2E（Electron） | `tests/e2e/test_electron.py` | `npm run test:e2e:electron` | 実アプリを起動し CDP で操作。argv 起動、chokidar、起動時の Python 確認と pptx 生成、端末での claude 自動起動、設定シートと外観、下書きから図生成と取り消し |

## 基準
- カバレッジ閾値（`vitest.config.ts`）: lines/statements/functions 80%、branches 70%。下回ると `test:coverage` が失敗する。対象は `src/` だけ（`electron/` は含まない）。
- Python は `--cov=tools` で 85% 以上を目安。
- 機能追加は「モデル/ストアのテストを先に赤で書く → 実装 → 緑」。UI はコンポーネントテストで操作結果（Markdown の変化）を確認する。
- E2E は「ユーザーが実際に行う一連の操作」単位で書く。細かい分岐は単体に落とす。

## 環境
- Node 24.15 以上、Python 3.12、`pip install -r requirements-dev.txt` と `python -m playwright install chromium`。バージョンは `requirements*.txt` と `package.json` で完全一致に固定している（更新は Dependabot の PR 経由）。
- Electron E2E は表示が必要。Linux では Xvfb を自動起動、macOS はそのまま動く。

## CI
- `ci.yml` unit（ubuntu）: typecheck、test:coverage、test:py、test:e2e。`tests/python/test_install_script.py` は Linux では skip
- `ci.yml` electron-mac（macos）: `tests/python/test_install_script.py` と test:e2e:electron
- `release.yml`（`v*` タグ）: typecheck と npm test、dist:mac、dmg の中のアプリの `codesign --verify --deep --strict`、zip からインストール用スクリプトで入れて署名を確認

## jsdom の制約
- ブラウザ版のフォルダハンドルは idb-keyval（IndexedDB）に置く。fake-indexeddb は structured clone でハンドルのメソッドを失う（`tests/unit/workspace.test.ts`）。
- CodeMirror の計測 API（`Range.getClientRects`）は `tests/setup.ts` でスタブする。

## 端末の手動確認（本物の `claude`）
1. `claude --version` が通る Mac で `npm run dev`、フォルダを開く
2. コンソールに `claude` が自動で立ち上がる（立ち上がらない場合は、コンソールバーで Claude Code を選んで「起動」）
3. 「3章にリスク一覧の表を追加して」→ 左ペインに新スライドが現れる
4. `npm run rebuild` が失敗した環境では、DevTools で `await window.mdslide.ptyBackend()` が `"host"` を返す（ホスト中継にフォールバックしている）ことを確認

## 配布版の手動確認（配布の手順を変えたとき。ADR-0021）
1. ブラウザで Releases の dmg をダウンロードし、Apple silicon の Mac で「アプリケーション」に入れる
2. `xattr -dr com.apple.quarantine /Applications/mdslide.app` を実行し、開けることを確かめる
3. インストール用コマンドでも入れ、開けることと、書き出しで pptx ができることを確かめる
