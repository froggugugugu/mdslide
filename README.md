# mdslide

Markdown を唯一の正として、報告用の PowerPoint 資料を作る macOS デスクトップアプリ(Electron)。

並べ替え・章番号・ページ分割といった「資料の体裁」はツールが面倒を見る。フォント・配色・ロゴは手持ちのスライドマスター(pptx)に任せる。人は Markdown を書くことに集中し、隣の端末で動く AI エージェントに下書きの整形や図の生成を頼める。

## 特徴

- **Markdown が唯一の正**。左ペインでの並べ替えやレイアウト変更も、すべて `deck.md` の書き換えとして実装している。章番号・スライド番号は Markdown に書かず、表示と出力のたびに導出する
- **書式はマスター任せ**。手持ちの pptx を保管フォルダにまとめ、資料ごとに frontmatter の `master:` で選ぶ。レイアウト名を `Cover / Agenda / Section / Body-Text / Body-2col` と付けるだけで、ツールは「どのレイアウトに何を流し込むか」だけを決める
- **本文量のガイド**。表示行モデルでスライドごとの本文量を推定し、エディタの見出し直下にゲージを出す。溢れたら縮小ではなく分割する
- **画像はファイル**。貼り付け・ドロップした画像は `images/` に保存し、相対パスで参照する。長辺の上限で自動縮小する
- **入口は Markdown ファイル**。開いた `.md` と同じフォルダの `images/`(貼り付けた画像)と `master.pptx`(書式)がひとまとまり。外部のプロセスがその Markdown を書き換えると自動で再読み込みする
- **AI エージェントと同居**。中央ペイン下の端末で Claude Code / Codex CLI / Gemini CLI などをそのフォルダで起動する。「下書き」に書いたメモを渡して `deck.md` に整形させ、`theme.json`(マスターの配色)に沿った図を生成させる
- **pptx 出力**。`deck.json` を経由して python-pptx がマスターのレイアウトに流し込む。表はネイティブの表、`> note:` はスピーカーノートになる

## 動作環境

| 項目 | 要件 |
| --- | --- |
| OS | macOS(Electron)。Linux / Windows は未検証 |
| Node.js | 22 以上 |
| Python | 3.12(pptx 出力と図生成。`requirements.txt`) |
| AI エージェント | 任意。PATH 上の `claude` `codex` `gemini` `aider` `copilot` `cursor-agent` `opencode` を検出して起動する |

ブラウザ版(`npm run dev:web`)は開発と E2E テストのためのもの。Chromium 限定で、pptx 生成と端末は使えない。

## インストール

配布版は [Releases](https://github.com/froggugugugu/mdslide/releases/latest) の dmg をダウンロードする(Apple silicon 向け)。未署名なので、初回は Finder で右クリック → 「開く」を選ぶか、次を実行する。

```bash
xattr -d com.apple.quarantine /Applications/mdslide.app
```

pptx 出力には別途 Python 3.12 と `requirements.txt` の導入が必要。

ソースから動かす場合:

```bash
npm ci                                       # Electron と node-pty の再ビルドを含む
python3 -m pip install -r requirements.txt   # 開発する場合は requirements-dev.txt
npm run dev
```

配布用のビルドは `npm run dist:mac`(未署名の dmg / zip を `release/` に出す)。

## 使い方

1. 起動画面で「新しく作る」を押し、保存先とファイル名を決める。表紙・章・スライド 1 枚だけの空の枠で Markdown ができる(見本は「サンプルを見る」)。手持ちの資料は「Markdown を開く」、フォルダ単位で扱うなら「フォルダを開く」(その中の `deck.md` を使う)。2 回目からは「最近開いたもの」から選べる
2. 「マスター」で、レイアウト名を規約どおりに付けた pptx を保管フォルダ(既定 `~/.config/mdslide/masters/`)に取り込み、この資料で使うものを選ぶ(見本: `examples/sample-master.pptx`)。選択は Markdown の frontmatter に `master: 名前.pptx` として書かれる。資料フォルダに `master.pptx` を置く方法も使える
3. 右ペインで Markdown を書く(Vim キーバインド)。左ペインでドラッグして並べ替える。番号は自動で振り直される
4. 「書き出す」で `out/deck.pptx` ができる

GUI を使わずに出力だけ行うこともできる。

```bash
python3 tools/export_pptx.py deck.json --master master.pptx -o out.pptx --assets .
```

### AI エージェントに任せる

1. 「下書き」(⌘I)に口語でメモを書く。`notes/` に自動保存され、ファイルをドロップしても `notes/` に入る
2. 端末(⌘J)でエージェントを起動し、「整形して deck.md に」を押す。渡す材料はチェックで選べる
3. 「図を統一テーマで生成」で、`![TODO 説明]()` の仮置きが `theme.json` の配色の PNG に置き換わる
4. 気に入らなければ「前の版に戻す」(`.mdslide/history/`)

フォルダには規約を書いた `CLAUDE.md`、`theme.json`、図の生成ヘルパー `tools/mdslide_draw.py` が自動で置かれる。

## Markdown の書き方

```markdown
---
title: 資料タイトル
subtitle: 副題
agenda: once            # once | per-section | none
numbering: chapter      # chapter (1, 1.1) | flat | none
---

# 章タイトル                      → 中表紙。アジェンダの項目にもなる
## 本文スライド
- 箇条書き(2 スペースで階層)
- **太字** と `コード`

## 構成図 {img=3/4 side=left}      → 画像 3/4 幅・左。残りが本文
![構成図](images/arch.png)

## 比較 {layout=2col}             → 最初の空行で左右に分かれる
左の内容

右の内容

## 表とノート
| 指標 | 目標 |
| --- | --- |
| 稼働率 | 99.9% |

> note: スピーカーノート
```

| 記法 | 意味 |
| --- | --- |
| `# 見出し` | 章(中表紙)。`#` より前の `##` は通し番号になる |
| `## 見出し {属性}` | 本文スライド。属性は Pandoc 形式 |
| `{img=1/1 \| 3/4 \| 1/2} {side=left \| right}` | 画像スライド。画像はアスペクト比を保って枠に内接 |
| `{layout=2col}` | 2 カラム。`Body-2col` レイアウトに流し込む |
| `{size=16}` | そのスライドの本文フォントサイズ(pt) |
| `![TODO 説明]()` | 画像の仮置き。この行で貼り付けると置き換わる |
| `> note:` | スピーカーノート |
| `---` | 本文内の明示的なページ分割 |

詳細は [docs/markdown-spec.md](docs/markdown-spec.md)。

## ワークスペースの構成

開いた Markdown の親フォルダが作業の単位になる。名前は自由で、フォルダを開いたときだけ `deck.md` が使われる。

```text
my-deck/
├── report.md            # 唯一の正(開いた Markdown。名前は自由)
├── images/              # 貼り付けた画像(相対パスで参照)
├── master.pptx          # このフォルダ専用のマスター(任意。通常は保管フォルダから frontmatter で選ぶ)
├── deck.json            # 書き出しの中間形式(契約 v2)
├── out/deck.pptx        # 生成結果
├── notes/               # 下書き・素材
├── theme.json           # マスターから抽出した配色とフォント
├── tools/mdslide_draw.py
├── CLAUDE.md            # エージェント向けの規約(初回のみ生成、編集可)
└── .mdslide/history/    # deck.md のスナップショット
```

## 設定

設定は 1 ファイル `~/.config/mdslide/settings.json`(`XDG_CONFIG_HOME` 準拠、`MDSLIDE_CONFIG` で場所を変更できる)に置く。手で編集した内容はウィンドウにフォーカスが戻ったときに反映される。マスターの保管フォルダ(`masters.dir`)と既定のマスター(`masters.default`)もここにある。

| 環境変数 | 用途 |
| --- | --- |
| `MDSLIDE_CONFIG` | 設定ファイルのパス |
| `MDSLIDE_PYTHON` | pptx 出力に使う Python(既定 `python3`) |
| `MDSLIDE_NODE` | node-pty を読み込めない環境で端末を中継する Node(既定 `node`) |

## 開発

```bash
npm run dev                  # Electron(electron-vite dev)
npm run dev:web              # ブラウザ版 http://localhost:5173
npm run typecheck            # tsc(src+tests / electron)
npm test                     # vitest(単体 + 内部結合)
npm run test:coverage        # 閾値 lines 80% / branches 70%
npm run test:py              # pytest(deck.json → pptx、図生成)
npm run test:e2e             # Web E2E(headless Chromium)
npm run test:e2e:electron    # Electron E2E(実アプリを起動。要ディスプレイ)
npm run test:all             # 上記すべて。PR の条件
```

| 層 | 場所 | 保証すること |
| --- | --- | --- |
| 単体 | `tests/unit/` | parser / render / fit / geometry / importMaster / workspace / 各コンポーネント |
| 内部結合 | `tests/integration/` | store を通した Markdown → スライド → 保存、フォルダ監視と競合 |
| Python | `tests/python/` | deck.json → pptx。レイアウト解決、画像内接、表、ノート、警告 |
| E2E | `tests/e2e/` | ユーザーが実際に行う一連の操作。Web は OPFS、Electron は CDP |

リリースは `package.json` の `version` を上げてタグを push する。`release.yml` が macOS ランナーで dmg / zip をビルドし、Releases に添付する。使い方ページ(GitHub Pages)は main への push で `pages.yml` が更新する。

```bash
git tag v0.1.0 && git push origin v0.1.0
```

設計の要点は次のとおり。詳細は [CLAUDE.md](CLAUDE.md) と [docs/adr/](docs/adr/)。

- `src/model/` は純粋関数。React にも Electron にも依存しない
- `src/store/` は Zustand。`markdown` 以外はすべて派生値
- レンダラから Node API を直接触らない。IPC の窓口は `electron/preload.ts` だけ
- プレビューと Python 出力は同じ幾何(`deck.json` の `geometry`)と同じ表示行モデルを共有する
- 振る舞いの変更はテストから始める。カバレッジ閾値は下げない

## 依存関係の固定

サプライチェーン攻撃への備えとして、依存はすべて完全一致で固定し、更新は PR 経由でのみ取り込む。

- **npm**: `package.json` は完全一致のバージョン(`.npmrc` の `save-exact`)。`package-lock.json` をコミットし、セットアップも CI も `npm ci`
- **Python**: `requirements.txt`(実行時)と `requirements-dev.txt`(テスト)で `==` 固定
- **GitHub Actions**: タグではなくコミット SHA で固定(コメントにバージョンを併記)。ワークフローの `GITHUB_TOKEN` は読み取り専用
- **更新**: Dependabot が週次で PR を出す。CI が緑のものだけ取り込む
- **Electron 本体**: バイナリの取得時に `@electron/get` が `SHASUMS256.txt` で検証する
- **端末で起動する CLI**: PATH 上のものをそのまま使う。このリポジトリは AI エージェントを同梱しない

## ドキュメント

- 使い方ページ: https://froggugugugu.github.io/mdslide/
- [docs/markdown-spec.md](docs/markdown-spec.md): Markdown 規約
- [docs/testing.md](docs/testing.md): テスト方針と環境
- [docs/adr/](docs/adr/): 設計判断の記録
- [docs/backlog.md](docs/backlog.md): バックログ
- [CLAUDE.md](CLAUDE.md): 変えてはいけない原則と構成

## ライセンス

[MIT](LICENSE)
