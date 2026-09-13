# ADR-0027 配布とサプライチェーンの守り

## 状況
- 2026-09-13 のセキュリティ点検で、次のことが分かった。
  - `release.yml` は contents: write のトークンを持つジョブで `npm ci` を実行していた。checkout がトークンを `.git/config` に残すので、依存パッケージの install スクリプトから読めた。
  - 紹介ページはインストールコマンドを載せているのに、Tailwind と Lucide を改ざん検知なしで CDN から読んでいた。cdn.tailwindcss.com は CORS を返さないため、SRI も付けられない。
  - 配布物が本物であることは GitHub アカウント 1 つにかかっていた。main とタグの保護、公開後のリリースの固定、Dependabot のアラートが無く、インストール用コマンドはダウンロードした zip を照合していなかった。
  - インストール用コマンドは python-pptx を版を固定せずに入れ、ソース配布物のビルド（任意のスクリプトの実行）も許していた。
  - Pages の書き込み権限が、リポジトリの内容を Jekyll に通す build ジョブにも付いていた。runner は `*-latest` だった。

## 決定
1. `release.yml` を build と publish の 2 ジョブに分ける。build は contents: read で、ビルド、署名とインストールの確認、ライセンス表示と fuses の確認をして、dmg / zip を成果物に上げる。publish だけが contents: write を持ち、リポジトリのコードも依存も実行せず、下書きのリリースに添付してから公開する。
2. リポジトリで Immutable releases を有効にする。公開後は添付ファイルとタグを変えられず、GitHub がリリース証明（attestation）を作る。
3. インストール用コマンドは、GitHub API でリリースの zip の sha256（digest）を取り、ダウンロードしたファイルと照らし合わせてから入れる。curl は `--proto '=https' --tlsv1.2` で https だけにする。
4. インストール用コマンドは python-pptx と依存を版で固定し、`--only-binary=:all:` で wheel だけを入れる。Python 3.9 では Pillow 12 が入らないので 11.3.0 を入れ、3.10 以上を勧める表示を出す。アプリの設定に出す入れ方のコマンドも python-pptx の版を固定する。
5. CI とリリースは `npm ci --ignore-scripts` で依存の install スクリプトを走らせず、アプリを動かすジョブだけ `npm run rebuild` で node-pty を作る。Electron 44 は本体を初めて使うときに取得する（`electron/index.js`）ので、`dist:mac` はパッケージの前に取得させる（ADR-0028 のライセンス文書もそこから取る）。
6. checkout は `persist-credentials: false`。runner は `ubuntu-24.04` と `macos-26` に固定する。`pages.yml` の書き込み権限（pages / id-token）は deploy ジョブだけに付ける。
7. 紹介ページの Tailwind（Play CDN 3.4.17）と Lucide（1.45.0）は `.github/pages/assets/` に置き、`integrity` 付きで同じサイトから読む。
8. リポジトリ設定: main はルールセットで削除と強制 push を禁じ、`v*` タグは削除・付け替え・強制 push を禁じる。Actions は SHA 固定を必須にし、使える action を GitHub 製と認証済みの作成者のものに限る。Dependabot のアラートとセキュリティ更新、非公開の脆弱性報告を有効にする。`SECURITY.md` に知らせ方と確かめ方を書く。

## 結果
- 依存パッケージのコードが、書き込み権限のあるトークンと同じ場所で動かない。
- 公開後のリリースは差し替えられず、インストール用コマンドは公開されたファイル以外を入れない。ただし、アカウントそのものが乗っ取られて新しい版を出されることまでは防げない。
- 作り直したいリリースは、版を上げて出し直す。Immutable releases のタグ名は再利用できない。
- 紹介ページの Tailwind と Lucide は Dependabot では更新されない。上げるときは assets のファイルと `integrity` を入れ替える。
- Python 3.9 の環境には、既知の脆弱性がある Pillow 11.3.0 が入る。書き出しで Pillow が読むのは、資料フォルダの中の画像だけ（ADR-0026）。
- GitHub 製と認証済みの作成者以外の action を足すときは、リポジトリ設定も変える。

## 状態
- 2026-09-13 実装。
