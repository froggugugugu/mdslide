# ADR-0019 書き出しに使う Python を起動時に確かめ、無ければ入れ方を案内する

## 状況
- 「書き出す」は同梱の `tools/export_pptx.py` を Python で動かす（ADR-0003）。Python と python-pptx はアプリに含まれない。
- 開発者の Mac では動いても、dmg を別の Mac に入れると python-pptx が無く、書き出した瞬間に Python のエラーの末尾が出るだけだった。
- Python は `PATH` の `python3` を使っていた。Finder から起動したアプリの `PATH` は最小限なので、Homebrew などに入れた Python は見えない。
- Command Line Tools の無い Mac では、`/usr/bin/python3` は実行するとシステムのインストーラーを開くだけのスタブである。起動時に確かめるつもりで実行すると、利用者の前に突然ダイアログが出る。

## 決定
1. main プロセスが Python を探す（`electron/python.ts`）。順序は、明示の指定（環境変数 `MDSLIDE_PYTHON`、設定 `export.python`）があればそれだけ。無ければ mdslide 専用の環境（`settings.json` の隣の `venv`）、`PATH`、macOS でよく使われる場所（`/opt/homebrew/bin`、`/usr/local/bin`、python.org の Framework、pyenv、`/usr/bin`）の順。
2. 各候補で `import pptx` を試し、最初に成功したものを書き出しに使う。成功しなければ、最初に動いた Python と「python-pptx が無い」ことを返す。
3. macOS で Command Line Tools が無い（`xcode-select -p` が失敗する）とき、`/usr/bin/python3` は実行しない。
4. アプリの起動時に確かめ（IPC `python:check`）、使えなければバナーで知らせる。バナーと、Python が原因で書き出しに失敗したときの通知から、設定の「書き出し」を開ける。
5. 設定の「書き出し」には、状態、再確認、Python の場所の指定、入れ方をコピーできるコマンドで示す。おすすめは mdslide 専用の環境を作る方法（`python3 -m venv <設定フォルダ>/venv` と `pip install python-pptx`）。アプリはこの場所を最初に探すので `PATH` に左右されず、Homebrew の Python の「外部管理環境」制限にも当たらない。Python 自体が無ければ `xcode-select --install` を先に示す。
6. アプリがインストールを自動実行することはしない。

## 結果
- 別の Mac でも、書き出す前に何が足りないかと直し方が分かる。
- 書き出しは確認で見つかった Python を使うので、Finder から起動しても Homebrew や専用の環境の Python で動く。
- IPC に `python:check` が増える。preload は `checkPython()` を公開する。

## 状態
- 2026-09-12 実装。
