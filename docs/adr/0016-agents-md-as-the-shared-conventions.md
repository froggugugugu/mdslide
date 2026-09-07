# ADR-0016 資料フォルダの規約は AGENTS.md に書き、CLAUDE.md は @AGENTS.md で読み込む

## 状況
- 資料フォルダを開くと、エージェント向けの規約を `CLAUDE.md` として置いていた（ADR-0009）。
- コンソールから起動できるのは Claude Code だけでなく Codex CLI / Gemini CLI / Aider などで、それらは `CLAUDE.md` を読まない。同じ規約を複数ファイルに複製すると、直したときにずれる。
- Claude Code には `CLAUDE.md` から `@path` で別ファイルを取り込む公式の仕組みがある。他の CLI エージェントは慣例として `AGENTS.md` を読む。

## 決定
1. 規約の本文は `AGENTS.md` に書く（`src/console/agentsMd.ts`）。ツール名に依存しない書き方にし、フォルダの中身と役割、`deck.md` の規約（frontmatter の全項目、見出し属性、画像、ノート、表）、材料の整形、図の生成、作業の流れを載せる。
2. `CLAUDE.md` は `@AGENTS.md` の 1 行だけにする。Claude Code はこれで同じ規約を読む。
3. どちらも初回だけ書き、人が編集したものは上書きしない。片方だけ無ければその片方だけ書く。
4. アプリ内のプロンプト（「AGENTS.md の規約に従い」）とドキュメントは `AGENTS.md` を参照する。

## 結果
- 規約が 1 か所になり、どの CLI エージェントでも同じ内容が読まれる。
- 既に `CLAUDE.md` に本文を持っているフォルダは、そのままでも動く（`AGENTS.md` だけが新たに置かれる）。統一したければ `CLAUDE.md` を `@AGENTS.md` の 1 行に書き換える。
- ADR-0009 の「CLAUDE.md を置く」をこの ADR が置き換える。

## 状態
- 2026-09-08 実装。
