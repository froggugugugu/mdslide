# サードパーティのライセンス表示

mdslide 本体は MIT License（[LICENSE](LICENSE)）です。配布物には、次のサードパーティのソフトウェアと素材が含まれます（ADR-0028）。

## 配布アプリ（mdslide.app）

- **Electron**（MIT License）と、Electron に含まれる Chromium などの部品。全文はアプリの `Contents/Resources/licenses/` にある `LICENSE.electron.txt` と `LICENSES.chromium.html` です。
- アプリが使う npm パッケージ（React、CodeMirror、xterm.js、node-pty、chokidar、JSZip、zustand など）。それぞれのライセンスファイルが、パッケージとともにアプリの `app.asar` に入っています。

## 見本マスター（examples/sample-master.pptx）

`scripts/make_sample_master.py` が、python-pptx に同梱された既定のテンプレート（`pptx/templates/default.pptx`）から作ります。アプリにも同梱しています。

```text
python-pptx

The MIT License (MIT)
Copyright (c) 2013 Steve Canny, https://github.com/scanny

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 紹介ページ（.github/pages/assets/）

- Tailwind CSS 3.4.17 の Play CDN スクリプト（MIT License、Copyright (c) Tailwind Labs, Inc.）
- Lucide 1.45.0（ISC License、Copyright (c) Lucide Contributors。一部は Feather の MIT License、Copyright (c) Cole Bemis）

## 商標

PowerPoint は Microsoft Corporation の、Claude Code は Anthropic PBC の、macOS と Apple silicon は Apple Inc. の商標または登録商標です。その他の会社名と製品名は、各社の商標または登録商標です。mdslide はこれらの企業とは関係のない、個人が作っているツールです。
