# ADR-0005 デスクトップ化は Electron、ファイル I/O は Backend 抽象の背後に置く

## 状況
File System Access API は Chromium 限定で、フォルダ権限の再取得にユーザー操作が要る。Python の生成スクリプトもアプリから起動したい。主環境は macOS。

## 決定
- Electron（electron-vite + electron-builder）でデスクトップ化する。Tauri は Rust ツールチェーンが増えるため見送り。
- レンダラは `Backend` インターフェース（readText/writeText/readBlob/writeBlob/modified/exists/watch/runExport）だけを使う。
  Electron 実装は IPC、ブラウザ実装は File System Access API。両方を保つ。
- ファイル監視は main プロセスの chokidar。ブラウザ版はポーリングで代替。
- pptx 生成は main プロセスが `tools/export_pptx.py` を spawn する（パッケージ時は `Resources/tools/`）。

## 結果
- Mac で `mdslide ./deck-folder` として起動でき、Claude Code の出力フォルダをそのまま開ける。
- 配布物は未署名。自分用なので Gatekeeper は右クリック→開くで回避する。署名・公証は必要になったら追加。
- Backend 抽象により Tauri へ移行する場合も `workspace.ts` の実装追加で済む。
