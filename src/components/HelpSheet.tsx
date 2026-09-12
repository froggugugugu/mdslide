import { isElectron } from "../workspace/workspace";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";
const alt = isMac ? "⌥" : "Alt";

/** One sheet, a few short sections. The goal is to answer "what do I do next" for someone who has not opened the app in a month. */
export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet help" onClick={(e) => e.stopPropagation()}>
        <h2>mdslide の使い方</h2>
        <p>Markdown を書くとスライドになります。番号・並び・分割はツールが面倒を見ます。</p>

        <h3>はじめの5分</h3>
        <ol>
          <li>設定（<kbd>{mod}</kbd> <kbd>,</kbd>）の「マスター」で、レイアウト名を <code>Cover / Agenda / Section / Body-Text / Body-2col</code> と付けた pptx を保管フォルダに取り込む。最初の 1 つは既定になる。資料ごとに変えるならツールバーのマスター選択で（資料フォルダに <code>master.pptx</code> を置いてもよい）。見本の pptx と、手持ちのテンプレートから作る手順・AI 用プロンプトは使い方ページの「マスターを用意する」にある</li>
          <li>起動画面の「{isElectron ? "Markdown を開く" : "フォルダを開く"}」で資料を開く。「新しく作る」は資料のフォルダを選ぶ（その場で作れる）と、中に <code>deck.md</code> を空の枠（表紙・章・スライド 1 枚）で作る。フォルダを開いた場合はその中の <code>deck.md</code>（無ければ見本から作成）を使う</li>
          <li>右のエディタで書く（既定は Vim キーバインド。設定の「エディタ」で通常のテキスト編集に切り替え可）。左のサムネイルはドラッグか <kbd>{alt}</kbd> <kbd>↑</kbd> <kbd>↓</kbd> で並べ替える。番号は自動</li>
          <li>「書き出す」で <code>out/deck.pptx</code>。Python と python-pptx が必要で、見つからなければ起動時に案内が出る（入れ方は設定の「書き出し」）</li>
        </ol>

        <h3>表紙情報（frontmatter）</h3>
        <p>ファイル先頭の <code>---</code> で囲んだ部分。表紙に載る情報と、資料全体の設定。どれも省略できる。</p>
        <table className="help-table">
          <tbody>
            <tr><td><code>title: 資料タイトル</code></td><td>表紙の題名</td></tr>
            <tr><td><code>subtitle: 2026年9月 定例</code></td><td>表紙の 2 行目</td></tr>
            <tr><td><code>author: 開発本部</code></td><td>表紙。発表者や部署</td></tr>
            <tr><td><code>date: 2026-09-06</code></td><td>表紙。日付</td></tr>
            <tr><td><code>agenda: once</code></td><td>アジェンダ。<code>once</code> 表紙の次に 1 枚（既定）/ <code>per-section</code> 各章の前にも / <code>none</code> 無し</td></tr>
            <tr><td><code>numbering: chapter</code></td><td>番号。<code>chapter</code> 1, 1.1（既定）/ <code>flat</code> 1, 2, 3 / <code>none</code> 無し</td></tr>
            <tr><td><code>master: corporate.pptx</code></td><td>保管フォルダのマスター名。ツールバーで選ぶと書き込まれる。省略時は資料フォルダの <code>master.pptx</code>、無ければ設定の既定。<code>none</code> で使わない</td></tr>
            <tr><td><code>layout: 2col</code></td><td>本文スライドの既定レイアウト。<code>text</code>（既定）/ <code>2col</code></td></tr>
            <tr><td><code>fontSize: 18</code></td><td>本文の既定フォントサイズ（pt）。省略時はマスターの書式、無ければ 18。スライド単位は <code>{"{size=16}"}</code></td></tr>
            <tr><td><code>imageMaxPx: 2000</code></td><td>貼り付け画像の長辺上限（px）。<code>0</code> で縮小しない</td></tr>
          </tbody>
        </table>

        <h3>Markdown の書き方</h3>
        <table className="help-table">
          <tbody>
            <tr><td><code># 章タイトル</code></td><td>中表紙。アジェンダにも載る</td></tr>
            <tr><td><code>## スライド</code></td><td>本文スライド</td></tr>
            <tr><td><code>## 図 {"{img=3/4 side=left}"}</code></td><td>画像 3/4 幅・左。残りが本文。<code>1/1 3/4 1/2</code></td></tr>
            <tr><td><code>## 比較 {"{layout=2col}"}</code></td><td>2カラム。最初の空行で左右に分かれる</td></tr>
            <tr><td><code>---</code></td><td>本文内の明示的なページ分割</td></tr>
            <tr><td><code>![TODO 構成図]()</code></td><td>画像の仮置き。この行で画像を貼ると置き換わる</td></tr>
            <tr><td><code>&gt; note: 補足</code></td><td>スピーカーノート</td></tr>
            <tr><td><code>| a | b |</code></td><td>表。パワポのネイティブ表になる</td></tr>
          </tbody>
        </table>

        <h3>キー操作</h3>
        <table className="help-table">
          <tbody>
            <tr><td><kbd>{mod}</kbd> <kbd>S</kbd> / <code>:w</code></td><td>保存（1.5秒後に自動保存もされる）</td></tr>
            <tr><td><kbd>Ctrl</kbd> <kbd>Space</kbd></td><td>スニペット <code>:body :section :2col :img :table :note :split</code></td></tr>
            <tr><td><kbd>]]</kbd> / <kbd>[[</kbd></td><td>次 / 前のスライド見出しへ（Normal）</td></tr>
            <tr><td><kbd>↑</kbd> <kbd>↓</kbd>（<kbd>K</kbd> <kbd>J</kbd>）</td><td>左のサムネイル一覧で前 / 次のスライドを選ぶ（一覧をクリックしてから）</td></tr>
            <tr><td><kbd>{alt}</kbd> <kbd>↑</kbd> / <kbd>{alt}</kbd> <kbd>↓</kbd></td><td>選んだスライドを上 / 下へ移動。章は中身ごと動く</td></tr>
            <tr><td>区切り線をドラッグ</td><td>サムネイルとエディタの幅を変える（次回も同じ幅）</td></tr>
            <tr><td>画像を貼り付け・ドロップ</td><td><code>images/</code> に保存して参照を挿入。名前は直上の見出しから</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>⇧</kbd> <kbd>C</kbd></td><td>表示中のスライドの参照 <code>deck.md:行</code> をコピー。プレビュー下の参照チップは画像パスも。サムネイル右クリックでもコピー</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>I</kbd></td><td>下書き。口語のメモを書く / ファイルをドロップ → notes/。ボタンで AI に「整形」「図生成」「描き直し」「要約」「章立て提案」を頼む</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>J</kbd></td><td>コンソールの表示 / 非表示</td></tr>
            <tr><td>アイコンにポインタを重ねる</td><td>説明とショートカットが出る（Tab で移動したときも）</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>,</kbd></td><td>設定（外観・Vim・マスターの保管フォルダ・CLI ツール）。メニューの「設定…」からも</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>/</kbd></td><td>この画面</td></tr>
          </tbody>
        </table>

        <h3>メモから資料へ</h3>
        <ol>
          <li>「下書き」に口語でつらつら書く。ファイルはウィンドウのどこにドロップしても <code>notes/</code> に入る</li>
          <li>コンソールでツールを起動し、「整形して deck.md に」を押す。AI が <code>deck.md</code> を書き、即座に左と中央に反映される</li>
          <li>「図を統一テーマで生成」で <code>![TODO ...]()</code> が <code>theme.json</code> の配色の PNG になる（<code>tools/mdslide_draw.py</code> のフロー・ベン図・柱・サイクル・マトリクス・年表）</li>
          <li>気に入らなければ「前の版に戻す」。あとはエディタとプレビューで直す</li>
        </ol>
        <h3>コンソール（CLI エージェント）</h3>
        <p>中央下のコンソールは、このフォルダで開いた本物のターミナルです。バーで選んだツール（Claude Code / Codex / Gemini / Aider など。設定の「ツール」で追加・編集、自動起動の切り替え）がシェル起動時に自動で立ち上がるので、「2章にリスク一覧の表を足して」と打つだけで <code>deck.md</code> が編集され、即座に反映されます。フォルダには規約を書いた <code>AGENTS.md</code> と、それを読み込む <code>CLAUDE.md</code>（中身は <code>@AGENTS.md</code> の 1 行）が自動で置かれます。</p>

        <div className="mt-4 flex justify-end"><button className="btn primary" onClick={onClose}>閉じる</button></div>
      </div>
    </div>
  );
}
