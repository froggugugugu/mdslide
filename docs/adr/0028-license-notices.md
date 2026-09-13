# ADR-0028 配布物のライセンス表示と商標

## 状況
- 配布アプリ（dmg / zip）に、Electron の `LICENSE` と、Chromium の部品のライセンスをまとめた `LICENSES.chromium.html` が入っていなかった。electron-builder は macOS 版で Electron.app だけを取り出し、これらを残さない。Chromium に含まれる BSD などのライセンスは、バイナリで配るときに表示が要る。
- 見本マスターは python-pptx（MIT License）に同梱のテンプレートから作り、アプリにも同梱しているが、表示が無かった。
- README と紹介ページで PowerPoint や Claude Code の名前を使っているが、商標の注記が無かった。

## 決定
1. electron-builder の `extraResources` で、`Contents/Resources/licenses/` に `LICENSE.electron.txt`、`LICENSES.chromium.html`、`LICENSE.mdslide.txt`、`THIRD_PARTY_NOTICES.md` を入れる。`release.yml` の build ジョブで、入っていることを確かめる。
2. `THIRD_PARTY_NOTICES.md` に、配布アプリに含まれるもの、見本マスターの元にした python-pptx のライセンス全文、紹介ページが同じサイトから配信するスクリプト（Tailwind・Lucide）、商標をまとめる。紹介ページのサイトにも置く。
3. README、マスターの作り方、紹介ページから `THIRD_PARTY_NOTICES.md` を示し、商標と、mdslide が各社と関係のない個人のツールであることを書く。

## 結果
- 配布アプリが `LICENSES.chromium.html` の分（約 19MB。dmg と zip では圧縮される）大きくなる。
- 配布物に入る依存や素材を足したときは、`THIRD_PARTY_NOTICES.md` に足すかを確かめる。

## 状態
- 2026-09-13 実装。
