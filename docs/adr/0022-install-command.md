# ADR-0022 配布版はインストール用のコマンドで入れてもらう

## 状況
- ADR-0021 のとおり、公証の無い配布版をブラウザでダウンロードすると、macOS は「壊れているため開けません」と表示し、ターミナルで隔離属性を外すまで開けない。
- 隔離属性（`com.apple.quarantine`）はブラウザなどが付ける。`curl` でダウンロードしたファイルには付かない。
- pptx の書き出しには python-pptx も要り、利用者は Python の環境を作るコマンドも別に実行していた。
- Developer ID 署名と公証には Apple Developer Program（年 99 米ドル）への登録が要る。

## 決定
1. `scripts/install.sh` を GitHub Pages のサイト直下（`install.sh`）に置き、`curl -fsSL https://froggugugugu.github.io/mdslide/install.sh | bash` を第一の入れ方として案内する。
2. スクリプトは Releases の zip を curl で取り、`ditto --noqtn` で展開し、`codesign --verify --deep --strict` が通ったものだけを `/Applications`（書き込めなければ `~/Applications`）の mdslide と入れ替える。mdslide が起動中なら入れ替えずに終了を促す。
3. 続けて、アプリが最初に探す `<設定フォルダ>/venv` に python-pptx を入れる。Command Line Tools の無い Mac で `/usr/bin/python3` を実行しない（ADR-0019）。ここで失敗しても、アプリの入れ替えは取り消さない。
4. 本体は最後の行の `main` 呼び出しで動かす。ダウンロードが途中で切れたスクリプトは何もしない。
5. dmg と `xattr` の手順は、コマンドを使わない入れ方として残す。
6. release ワークフローで、ビルドした zip からスクリプトで入れ、入れたアプリの署名を確かめてからリリースを作る。

## 結果
- 1 行でアプリと python-pptx が入り、そのまま開ける。
- Gatekeeper の確認を通らない入れ方なので、利用者にはスクリプトと配布元を信用してもらうことになる。スクリプトはリポジトリで読める。
- Developer ID 署名と公証は、利用者が増えたら改めて判断する（backlog の「macOS 署名・公証」）。

## 状態
- 2026-09-12 実装。
