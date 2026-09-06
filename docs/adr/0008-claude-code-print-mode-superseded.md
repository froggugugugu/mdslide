# ADR-0008 Claude Code 連携は print モード（`claude -p`）のストリームで行う（ADR-0009 により置換）

## 状況
中央ペイン下のコンソールから Claude Code に指示を出したい。候補は (a) node-pty + xterm.js で対話 TUI を埋め込む、(b) `claude -p --output-format stream-json` を都度起動、(c) Agent SDK を Electron main に組み込む。

## 決定
- (b) を採用。ネイティブ依存が無く、1 指示 = 1 プロセスで状態が明快。`--resume <session_id>` で会話を継続する。
- 権限は `--permission-mode acceptEdits` と `--allowedTools Read,Edit,Write,Glob,Grep,Bash(ls *),Bash(cat *)`。対話的な許可プロンプトが出ない範囲に限定する。
- deck.md の規約は `--append-system-prompt` で毎回渡す（フォルダの CLAUDE.md に依存しない）。
- 実行ファイルは `MDSLIDE_CLAUDE` で差し替え可能にし、E2E では偽の `claude` で検証する。

## 結果
- Claude Code の TUI（スラッシュコマンドの補完、許可ダイアログ）は使えない。必要なら (a) に拡張する。
- 各指示の起動に数秒かかる。`--bare` は CLAUDE.md や hooks を読まないため、必要になれば選択式にする。
- 本物の `claude` に対する E2E は CI では回さない（認証と課金が要る）。手動確認の手順を docs/testing.md に置く。
