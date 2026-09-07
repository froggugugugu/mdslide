# mdslide — Claude Code 向け作業指針

Markdown を唯一の正とする、報告用スライド専用のパワポエディタ。汎用性より作業効率を優先する。

## 変えてはいけない原則

1. **Markdown が唯一の正（Single Source of Truth）**
   左ペインの並べ替え・レイアウト変更は、すべて `serializeDeck` 経由で Markdown を書き換える操作として実装する。
   スライド番号・章番号は Markdown に書かない。`renderDeck` が毎回導出する。
2. **書式はパワポ側に任せる**
   フォント・配色・ロゴ・余白はスライドマスター（取り込んだ pptx）の責務。ツールは「どのレイアウトに何を流し込むか」だけを決める。
   マスターは保管フォルダ（設定 `masters.dir`、既定 `~/.config/mdslide/masters/`）に置き、資料は frontmatter `master: 名前.pptx` で選ぶ。
   解決順は frontmatter → 資料フォルダの `master.pptx` → 設定の既定（`resolveMasterId`）。黙って先頭を選ばない。IndexedDB は使わない（ADR-0013）。
3. **役割つきレイアウト名の規約**
   `Cover / Agenda / Section / Body-Text / Body-2col`（大文字小文字・ハイフン無視）。判定は `roleFromLayoutName`。
   画像スライドはマスターに専用レイアウトを持たせず、`Body-Text` の上に `src/layouts/geometry.ts` の計算で配置する。
   プレビューと Python 出力は同じ幾何（deck.json の `geometry`、EMU）を共有する。幾何を変えるときは geometry.ts とテストを直す。
4. **入口は Markdown ファイル、単位はフォルダ、本体は Electron**（ADR-0013）
   開いた `.md` の親フォルダがワークスペース。ファイル名は `Workspace.deckFile`（既定 `deck.md`。フォルダを開いたとき・「新しく作る」でフォルダを選んだときはこの名前。ADR-0015）で、`deck.md` をコードに直書きしない。
   `images/` / `master.pptx` / `deck.json` / `out/deck.pptx` / `notes/` はその隣に置く。
   起動直後は起動画面（`StartScreen`）。サンプルは「サンプルを見る」でだけ表示し、黙って出さない。
   ファイル I/O は `src/workspace/workspace.ts` の `Backend` インターフェースに閉じ込める。
   Electron では main プロセス（Node fs + chokidar 監視 + Python 起動）、ブラウザ版では File System Access API（Chromium のみ、ポーリング）。
   レンダラから直接 Node API を触らない。IPC の窓口は `electron/preload.ts` のみ。
   外部（Claude Code 等）が `deck.md` を書き換えたら、未編集なら自動再読み込み（ビューアモード）。
5. **ラウンドトリップ保証**
   `serializeDeck(parseMarkdown(md))` は末尾改行の正規化を除き `md` と一致する。`tests/model.test.ts` を壊さない。

## デザイン言語（macOS ネイティブ寄せ）

- トークンは `src/index.css` の `:root` に集約。色・角丸・影はすべて CSS 変数経由。ライト/ダークは `prefers-color-scheme` で自動。
- コンポーネント用クラス：`.toolbar` `.btn`（`.primary` `.quiet`）`.select` `.segmented > .seg`（`.on`）`.link` `.banner`（`.info` `.warn`）`.navigator` `.nav-item` `.stage` `.editor` `.sheet` `.card`。
  新しい UI はこれらを使い、インラインの色指定を増やさない。
- システムフォント（-apple-system）、0.5px ヘアライン、システムブルー `#0a84ff`、装飾は影と余白だけ。絵文字・下線リンクは使わない。
- アイコンは `src/components/Icon.tsx` の単色ラインアイコン（SF Symbols 風、20px グリッド、currentColor）だけを使う。画像やアイコンフォントは入れない。
  アイコンだけのボタンは `.btn.icon`（ペインの開閉状態は `.on`）にし、必ず `aria-label`（テストと E2E が名前で探す）と `title`（ショートカット併記）を付ける。文字ボタンにアイコンを添えるときは `.btn.with-icon`。
- ペイン幅（サムネイル・エディタ）は区切り線 `.vsplitter` のドラッグで変え、`settings.json` に記憶する（`navigator.width` / `editor.width`）。
- Electron の macOS ウィンドウは `hiddenInset` + `vibrancy: sidebar`。`body.electron` で背景を透過し、サイドバーとツールバーが透ける。
- エディタの配色は `EditorPane.tsx` の `HighlightStyle` で CSS 変数に解決する。

## 構成

```
src/model/      imageProcess.ts (貼り付け画像の縮小・形式判定。Chromium の OffscreenCanvas 前提、無ければ原本)  fit.ts (表示行モデル。Python 側 export_pptx.py の display_lines と対で保つ)  boxes.ts (レイアウトごとの本文枠 pt)  refs.ts (Claude Code 向け参照 deck.md:行 / 画像パス)  parser.ts (parse/serialize/move/withAttr)  render.ts (numbering, agenda, auto-split)  types.ts
src/master/     importMaster.ts (pptx zip → layouts/placeholders)  masterSource.ts (保管フォルダ / メモリのマスター一覧・取り込み)  sampleMaster.ts (examples/sample-master.pptx をバンドルし、設定の「見本を取り込む」で保管フォルダへ)
src/store/      deckStore.ts (zustand。markdown 以外はすべて派生値)
src/components/ App (ツールバー・ペイン幅) / StartScreen (起動画面: Markdown を開く・新しく作る・フォルダ・最近・サンプル) / ThumbnailPane (DnD、↑↓ で選択、⌥↑↓ で並べ替え) / PreviewPane (レイアウト選択) / SlideCanvas (スライド描画) / EditorPane (CodeMirror + Vim) / SettingsSheet (設定シート: 一般・エディタ・マスター・ツール。開くのは useSettingsSheet。ADR-0014) / Icon (単色ラインアイコン)
src/export/     exportJson.ts (deck.json 契約 v2: slideSize, geometry 付き)
src/layouts/    geometry.ts (画像/本文の配置計算)  presets.ts (マスター無し時の既定枠)
src/settings/   settings.ts (settings.json の読み書き。設定は必ずここを通す。ADR-0010)
src/console/    presets.ts (CLI プリセット)  terminalStore.ts (端末セッション状態)  toolsStore.ts (CLI ツールのプリセットと設定)  agentsMd.ts (フォルダ用 AGENTS.md と、それを @import する CLAUDE.md。ADR-0016)
src/console/    prompts.ts (端末に流す定型プロンプト。1 行ずつ)  inboxStore.ts (notes/ への下書き自動保存)
src/settings/appearance.ts (外観: <html data-theme> と Electron の nativeTheme。CSS は light-dark() で色を一度だけ書く)
src/components/InboxDrawer.tsx (素材の受け入れと AI への指示。ADR-0012)  editorGuides.ts (区切り線・ゲージ・分割マーカーの装飾)
src/components/TerminalPane.tsx (xterm.js 端末)  HelpSheet.tsx (使い方。初回起動で自動表示、⌘/)
electron/pty.ts (node-pty / ホスト中継)  electron/ptyHost.cjs
src/workspace/  workspace.ts (フォルダ I/O、Markdown ファイルの入口と最近一覧、画像保存、外部変更検知)  bootstrap.ts (CLAUDE.md / theme.json / tools / notes の生成)  history.ts (.mdslide/history/ スナップショットと undo)
src/components/editorExtensions.ts (画像貼り付け/ドロップ、スニペット Ctrl-Space、]] [[ 見出し移動、Mod-s / :w 保存)
tools/          export_pptx.py (deck.json + master.pptx → out.pptx, python-pptx)  mdslide_draw.py (theme.json 準拠の図生成。ワークスペースに配布)
docs/           markdown-spec.md, master-guide.md (マスター pptx の作り方と AI 用プロンプト。紹介ページの同節と内容を揃える), testing.md, adr/, backlog.md, media/ (README のデモ GIF とコンセプト図)
.github/pages/  index.html (GitHub Pages の紹介ページ。Tailwind / Lucide を CDN で読む単一ファイル。サイトのトップに置かれ、README は README.html になる)  _config.yml (Jekyll)
scripts/        make_demo_gif.py (実アプリを CDP で操作して README のデモ GIF を再生成)  make_icon.py (docs/media/icon.svg から build/icon.png・icon.icns を生成)
build/          icon.png / icon.icns (アプリアイコン。electron-builder と開発時の Dock が使う。元は docs/media/icon.svg)
examples/       sample-master.pptx（レイアウト名規約の見本）
```

## コマンド

```
npm ci               # postinstall で node-pty を electron-rebuild（失敗してもホスト中継にフォールバック）
pip install -r requirements-dev.txt   # 実行時のみなら requirements.txt
npm run dev          # Electron（electron-vite dev）
npm run dev:web      # ブラウザ版 http://localhost:5173（Chromium 限定）
npm test             # vitest（単体＋内部結合）
npm run test:coverage
npm run test:py      # python-pptx 出力
npm run test:e2e     # Web E2E（headless Chromium）
npm run test:e2e:electron
npm run test:all
npm run typecheck
npm run build        # Electron → out/
npm run build:web    # ブラウザ版 → dist/（静的配布可能）
npm run dist:mac     # dmg / zip（未署名）→ release/
python3 tools/export_pptx.py deck.json --master master.pptx -o out.pptx --assets ./images-root
```

## コンソール（端末）

- `electron/pty.ts`：node-pty をこのプロセスで読み込む。読めなければ `electron/ptyHost.cjs` をシステム `node` で起動して中継（ADR-0009）。
- `src/console/terminalStore.ts`：セッション状態と設定（開閉・高さ・claude 自動起動）。`src/components/TerminalPane.tsx`：xterm.js。
- 設定を増やすときは `SettingsFile` と `DEFAULT_SETTINGS` に項目を足し、localStorage を直接使わない。UI は `SettingsSheet` のタブに置き、メイン画面（ツールバー・コンソールバー）に設定コントロールを置かない（ADR-0014）。frontmatter を書き換える「資料の設定」（この資料のマスター、レイアウト）は別で、メイン画面に残す。
- 起動するツールは `presets.ts` の `PRESET_TOOLS`。プリセットを増やすときはコマンド名が公式のものであることを確認する。
- フォルダを開いたら `AGENTS.md`（規約）と `CLAUDE.md`（`@AGENTS.md` の 1 行）、`theme.json` `tools/mdslide_draw.py` `notes/` を用意する（`src/workspace/bootstrap.ts`）。Markdown 規約を変えたら `agentsMd.ts` も更新する。規約は AGENTS.md にだけ書き、CLAUDE.md には書かない（ADR-0016）。
- 定型プロンプトは `src/console/prompts.ts`。1 行で書く（端末に 1 メッセージとして流す）。
- ネイティブモジュールを増やすときは `electron-builder.yml` の `asarUnpack` と `postinstall` を更新する。

## テスト（必須）

- 詳細は `docs/testing.md`。`npm run test:all` が通ることを PR の条件にする。
- 進め方は TDD：モデル/ストアの振る舞いはテストを先に書く。UI はコンポーネントテストで「操作 → Markdown がどう変わるか」を固定する。
- カバレッジ閾値は lines 80% / branches 70%（`vitest.config.ts`）。閾値を下げてはいけない。
- 新しい IPC を足したら `tests/unit/workspace.test.ts`（ブリッジ呼び出し）と `tests/e2e/test_electron.py`（実機）の両方に追加する。
- Python 側を変えたら `tests/python/` を先に更新する。deck.json の契約変更は `version` を上げる。

## 作業の進め方

- モデル層（`src/model`）を変更したら必ずテストを追加・更新する。UI より先にモデルで振る舞いを確定する。
- `deck.json` の契約（`ExportDeck`）を変えるときは `version` を上げ、Python 側の検証も更新する。
- 優先順位は `docs/backlog.md` の順。ADR は `docs/adr/` に追記（番号連番、既存は変更せず supersede）。
- 絵文字・装飾的な記号は UI にもドキュメントにも使わない。

## Claude Code 側でデッキを生成するとき

- `docs/markdown-spec.md` の規約で `deck.md` を書く。番号は書かない。図は `![TODO 説明]()` のプレースホルダで置き、人が後から貼り付ける。
- 図を生成する場合は `images/` に PNG を書き、`![説明](images/xxx.png)` で参照する。
- 生成後、mdslide が開いていれば自動で再読み込みされる。
