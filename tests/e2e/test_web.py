"""Browser build: editing, reordering, master import, folder workspace over OPFS, viewer reload, snippets, export."""
from conftest import PASTE_JS, ROOT, png_b64

OPFS_READ = "async(p)=>{const r=await navigator.storage.getDirectory();const parts=p.split('/');let d=r;for(const x of parts.slice(0,-1))d=await d.getDirectoryHandle(x);return await (await (await d.getFileHandle(parts.at(-1))).getFile()).text();}"
OPFS_WRITE = "async([p,t])=>{const r=await navigator.storage.getDirectory();const h=await r.getFileHandle(p,{create:true});const w=await h.createWritable();await w.write(t);await w.close();}"
OPFS_LIST = "async(p)=>{const r=await navigator.storage.getDirectory();const d=await r.getDirectoryHandle(p);const o=[];for await(const k of d.keys())o.push(k);return o;}"
OPFS_RESET = "async()=>{const r=await navigator.storage.getDirectory();for await(const k of r.keys())await r.removeEntry(k,{recursive:true});}"


def open_folder(page):
    page.evaluate(OPFS_RESET)
    page.get_by_role("button", name="フォルダを開く").click()
    page.wait_for_timeout(800)


def view_sample(page):
    """The start screen shows nothing until asked; the built-in sample is one of the ways in."""
    page.get_by_role("button", name="サンプルを見る").click()
    page.wait_for_timeout(300)


def test_renders_sample_and_reorders_with_renumbering(web_page):
    pg = web_page
    view_sample(pg)
    thumbs = pg.locator(".nav-item")
    assert thumbs.count() >= 10
    assert pg.locator(".nav-item .label", has_text="1.1. 取り組みの背景").count() == 1
    src, dst = pg.locator(".thumb").nth(3), pg.locator(".thumb").nth(4)
    src.drag_to(dst, target_position={"x": 50, "y": 90})
    pg.wait_for_timeout(400)
    labels = pg.locator(".nav-item .label").all_inner_texts()
    assert labels[3] == "1.1. 目的とゴール" and labels[4] == "1.2. 取り組みの背景"
    # markdown followed the move
    assert "## 目的とゴール" in pg.locator(".cm-content").inner_text().split("## 取り組みの背景")[0]
    assert pg.errors == []


def test_master_import_drives_preview_and_layout_picker(web_page):
    pg = web_page
    view_sample(pg)
    pg.get_by_role("button", name="マスター").click()
    pg.set_input_files("input[type=file][accept='.pptx,.potx']", str(ROOT / "examples" / "sample-master.pptx"))
    pg.wait_for_timeout(1200)
    assert pg.get_by_text("Body-Text").first.is_visible()
    pg.get_by_role("button", name="閉じる").click()
    assert "sample-master" in pg.get_by_role("banner").get_by_role("combobox").input_value()  # dir:sample-master.pptx
    pg.locator(".thumb").nth(3).click()
    pg.get_by_role("button", name="画像", exact=True).click()
    pg.get_by_role("button", name="3/4").click()
    pg.get_by_role("button", name="左").click()
    pg.wait_for_timeout(200)
    assert "{img=3/4 side=left}" in pg.locator(".cm-content").inner_text()
    assert "Body-Text" in pg.locator(".footer").inner_text()
    assert pg.errors == []


def test_folder_workspace_paste_autosave_viewer_reload_and_export(web_page):
    pg = web_page
    open_folder(pg)
    assert pg.get_by_role("button", name="保存済み").is_visible()
    # paste a screenshot on the placeholder line
    pg.locator(".cm-content").click(); pg.keyboard.press("Escape"); pg.keyboard.type("29G")
    pg.evaluate(PASTE_JS, png_b64(800, 500))
    pg.wait_for_timeout(2500)
    assert pg.evaluate(OPFS_LIST, "images") == ["2-1-計測基盤の構成.png"]
    md = pg.evaluate(OPFS_READ, "deck.md")
    assert "![構成図](images/2-1-計測基盤の構成.png)" in md
    assert pg.get_by_role("button", name="保存済み").is_visible()
    # viewer mode: rewrite deck.md from outside while clean
    pg.evaluate(OPFS_WRITE, ["deck.md", md.replace("# 背景と目的", "# 背景と目的（外部更新）")])
    pg.wait_for_timeout(3500)
    assert pg.locator(".nav-item .label", has_text="1. 背景と目的（外部更新）").count() == 1
    # dirty + external change -> banner, no autosave clobber
    pg.locator(".cm-content").click(); pg.keyboard.press("Escape"); pg.keyboard.type("Goローカル編集")
    pg.keyboard.press("Escape")
    pg.evaluate(OPFS_WRITE, ["deck.md", md.replace("# 背景と目的", "# 外部2")])
    pg.wait_for_timeout(3500)
    assert pg.get_by_text("フォルダ側で変更されました").is_visible()
    assert "外部2" in pg.evaluate(OPFS_READ, "deck.md")
    pg.get_by_role("button", name="こちらで上書き").click(); pg.wait_for_timeout(500)
    assert "ローカル編集" in pg.evaluate(OPFS_READ, "deck.md")
    # export writes deck.json v2 into the folder
    pg.get_by_role("button", name="書き出す").click(); pg.wait_for_timeout(800)
    assert '"version": 2' in pg.evaluate(OPFS_READ, "deck.json")
    assert pg.errors == []


def test_snippets_and_heading_motions(web_page):
    pg = web_page
    view_sample(pg)
    pg.locator(".cm-content").click(); pg.keyboard.press("Escape")
    pg.keyboard.type("Go"); pg.keyboard.type(":2c"); pg.keyboard.press("Control+Space"); pg.wait_for_timeout(400)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    assert "{layout=2col}" in pg.locator(".cm-content").inner_text()
    pg.keyboard.press("Escape"); pg.keyboard.type("gg]]]]"); pg.wait_for_timeout(200)
    assert pg.evaluate("()=>document.querySelector('.cm-activeLine')?.textContent").startswith("## 取り組みの背景")
    pg.keyboard.type("[["); pg.wait_for_timeout(200)
    assert pg.evaluate("()=>document.querySelector('.cm-activeLine')?.textContent").startswith("# 背景と目的")
    assert pg.errors == []


def test_pasted_images_are_downscaled_and_compressed(web_page):
    from PIL import Image
    import base64, io
    pg = web_page
    open_folder(pg)
    pg.locator(".cm-content").click(); pg.keyboard.press("Escape"); pg.keyboard.type("13G")
    pg.evaluate(PASTE_JS, png_b64(3200, 1800))            # Retina screenshot: scaled to 2000px, stays PNG
    pg.wait_for_timeout(2500)
    pg.evaluate(PASTE_JS, png_b64(400, 300, noise=True))  # photo-like: becomes JPEG
    pg.wait_for_timeout(2500)
    names = sorted(pg.evaluate(OPFS_LIST, "images"))
    assert any(n.endswith(".png") for n in names) and any(n.endswith(".jpg") for n in names), names
    for n in names:
        data = base64.b64decode(pg.evaluate("async(n)=>{const r=await navigator.storage.getDirectory();const d=await r.getDirectoryHandle('images');const f=await (await d.getFileHandle(n)).getFile();const b=new Uint8Array(await f.arrayBuffer());let s='';b.forEach(x=>s+=String.fromCharCode(x));return btoa(s);}", n))
        im = Image.open(io.BytesIO(data))
        if n.endswith(".png"):
            assert im.size == (2000, 1125)
        else:
            assert im.format == "JPEG" and im.size == (400, 300)
    md = pg.evaluate(OPFS_READ, "deck.md")
    assert md.count("](images/") >= 2
    assert pg.get_by_text("で保存しました").count() == 1
    assert pg.errors == []
