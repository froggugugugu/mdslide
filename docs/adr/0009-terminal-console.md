# ADR-0009 コンソールは本物の擬似端末（node-pty + xterm.js）にする

ADR-0008 を置き換える。

## 状況
print モード（`claude -p`）ではスラッシュコマンド補完や許可ダイアログが使えず、Claude Code の体験が削がれる。私用ツールなので利用者に環境を合わせてもらえる。

## 決定
- 中央下のペインは xterm.js の端末。フォルダを cwd にログインシェルを起動し、既定で `claude` を自動実行する（コンソールバーで切替）。
- 規約は `--append-system-prompt` ではなく、フォルダに自動生成する `CLAUDE.md`（`src/console/deckClaudeMd.ts`）で渡す。既にあれば上書きしない。
- node-pty は `postinstall` で `electron-rebuild` する。失敗しても動くように、システムの `node` で `electron/ptyHost.cjs` を起動するフォールバックを持つ（同じプロトコルを JSON 行で中継）。`MDSLIDE_NODE` で node を指定可。
- E2E は PATH に偽の `claude` を置き、自動起動・入力・deck.md 反映・cwd を実端末で検証する。

## 結果
- Claude Code の対話機能がそのまま使える。シェルとしても使える。
- ネイティブ依存が増えた。macOS では Xcode Command Line Tools が必要。
- ホスト経由の場合は 1 プロセス分のオーバーヘッドがある。`pty:backend` IPC で現在の方式が分かる。
