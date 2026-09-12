# ADR-0020 配布ビルドはアドホック署名にし、公証はしない

## 状況
- v0.1.0 と v0.2.0 の dmg は `electron-builder.yml` の `identity: null` で署名を省いていた。
- electron-builder は Electron.app の名前・Info.plist・アイコンを書き換え、app.asar を入れる。Electron の実行ファイルに付いているリンカ署名（アドホック）はバンドルの中身を封印していないので、書き換えた後のバンドルは `codesign --verify` で「code has no resources but signature indicates they must be present」になる。
- ブラウザでダウンロードしたファイルには隔離属性（`com.apple.quarantine`）が付く。署名の壊れたアプリに隔離属性があると、macOS は「壊れているため開けません。ゴミ箱に入れる必要があります」と表示し、システム設定からも開けない。v0.2.0 を別の Mac に入れた利用者がここで止まった。
- macOS 15 以降は、Finder の右クリックから「開く」で公証の無いアプリを開けなくなった。README と紹介ページの案内はこの方法だった。
- Developer ID で署名して公証するには Apple Developer Program（有料）が要る。個人の報告用ツールとしてまだ入らない（backlog の「macOS 署名・公証」）。

## 決定
1. `mac.identity: "-"` でアドホック署名する。バンドル全体が封印され、署名の検証が通る。
2. `mac.hardenedRuntime: false` にする。Hardened Runtime は公証のためのもので、アドホック署名と組み合わせるとライブラリ検証が Electron のフレームワークを拒み、起動できない（electron-builder の `hardenedRuntime` の説明）。
3. release ワークフローで dmg の中のアプリに `codesign --verify --deep --strict` をかけ、通らなければリリースを作らない。
4. 初回の開き方は、システム設定の「プライバシーとセキュリティ」にある「このまま開く」と、ターミナルの `xattr -dr com.apple.quarantine /Applications/mdslide.app` の 2 つを案内する。右クリックの案内は消す。

## 結果
- ダウンロードしたアプリは「壊れている」ではなく「開発元を検証できない」扱いになり、システム設定から開ける。
- 公証はしていないので、初回の確認は残る。無くすには Developer ID 署名と公証が要る。
- 署名の壊れた dmg は CI で止まり、公開されない。

## 状態
- 2026-09-12 実装。
