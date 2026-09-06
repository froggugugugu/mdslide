import { isElectron } from "../workspace/workspace";

const mod = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

/** One sheet, four short sections. The goal is to answer "what do I do next" for someone who has not opened the app in a month. */
export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet help" onClick={(e) => e.stopPropagation()}>
        <h2>mdslide の使い方</h2>
        <p>Markdown を書くとスライドになります。番号・並び・分割はツールが面倒を見ます。</p>

        <h3>はじめの5分</h3>
        <ol>
          <li>「マスター」で、レイアウト名を <code>Cover / Agenda / Section / Body-Text / Body-2col</code> と付けた pptx を保管フォルダに取り込み、この資料で使うものを選ぶ（資料フォルダに <code>master.pptx</code> を置いてもよい）</li>
          <li>起動画面の「{isElectron ? "Markdown を開く" : "フォルダを開く"}」で資料を開く。「新しく作る」は保存先を選ぶと空の枠（表紙・章・スライド 1 枚）で作る。フォルダを開いた場合はその中の <code>deck.md</code>（無ければ見本から作成）を使う</li>
          <li>右のエディタで書く（既定は Vim キーバインド。コンソールバーの「ツール設定」で通常のテキスト編集に切り替え可）。左でドラッグして並べ替える。番号は自動</li>
          <li>「書き出す」で <code>out/deck.pptx</code></li>
        </ol>

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
            <tr><td>画像を貼り付け・ドロップ</td><td><code>images/</code> に保存して参照を挿入。名前は直上の見出しから</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>⇧</kbd> <kbd>C</kbd></td><td>表示中のスライドの参照 <code>deck.md:行</code> をコピー。プレビュー下の参照チップは画像パスも。サムネイル右クリックでもコピー</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>I</kbd></td><td>下書き。口語のメモを書く / ファイルをドロップ → notes/。ボタンで AI に「整形」「図生成」「描き直し」「要約」「章立て提案」を頼む</td></tr>
            <tr><td><kbd>{mod}</kbd> <kbd>J</kbd></td><td>コンソールの表示 / 非表示</td></tr>
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
        <p>中央下のコンソールは、このフォルダで開いた本物のターミナルです。バーで選んだツール（Claude Code / Codex / Gemini / Aider など。「設定」で追加・編集）がシェル起動時に自動で立ち上がるので、「2章にリスク一覧の表を足して」と打つだけで <code>deck.md</code> が編集され、即座に反映されます。フォルダには規約を書いた <code>CLAUDE.md</code> が自動で置かれます。</p>

        <div className="mt-4 flex justify-end"><button className="btn primary" onClick={onClose}>閉じる</button></div>
      </div>
    </div>
  );
}
