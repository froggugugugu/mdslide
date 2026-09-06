"""Regenerate docs/media/demo.gif for the README by driving the real Electron app over CDP.

    npm run build && python3 scripts/make_demo_gif.py        # needs requirements-dev.txt (playwright, pillow)

Frames are captured at key moments with per-frame hold times, then downscaled and quantized with Pillow.
The app runs against a throwaway workspace and settings file; nothing on the machine is touched."""
import io, json, os, re, shutil, signal, subprocess, tempfile, time, urllib.request
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "media" / "demo.gif"
WIDTH = 1100  # GIF width in px

def wait_http(url, timeout=60):
    for _ in range(timeout * 2):
        try: urllib.request.urlopen(url, timeout=1); return True
        except Exception: time.sleep(0.5)
    return False

# Sample deck text from the app's built-in sample (the template literal in src/sample.ts).
sample_src = (ROOT / "src" / "sample.ts").read_text(encoding="utf8")
SAMPLE = re.search(r"SAMPLE_MARKDOWN = `([\s\S]*?)`;", sample_src).group(1)

tmp = Path(tempfile.mkdtemp(prefix="mdslide-demo-"))
ws = tmp / "資料" / "四半期報告"; ws.mkdir(parents=True)
(ws / "deck.md").write_text(SAMPLE, encoding="utf8")
shutil.copy(ROOT / "examples" / "sample-master.pptx", ws / "master.pptx")
cfg = tmp / "config" / "settings.json"; cfg.parent.mkdir()
cfg.write_text(json.dumps({"version": 1, "help": {"seen": True}, "console": {"open": False, "autoStart": False, "height": 260},
                           "workspace": {"lastPath": None, "lastDeckFile": None, "recent": [{"path": str(ws), "deckFile": "deck.md"}]},
                           "editor": {"vim": True, "width": None}}, ensure_ascii=False), encoding="utf8")
env = {**os.environ, "ELECTRON_DISABLE_SECURITY_WARNINGS": "1", "MDSLIDE_CONFIG": str(cfg), "SHELL": "/bin/zsh"}
binary = subprocess.run(["node", "-e", "process.stdout.write(require('electron'))"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
port = 9444
proc = subprocess.Popen([binary, ".", "--no-sandbox", f"--remote-debugging-port={port}"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
assert wait_http(f"http://127.0.0.1:{port}/json/version"), "electron did not expose CDP"

frames = []  # (Image, duration_ms)
def snap(pg, hold):
    im = Image.open(io.BytesIO(pg.screenshot())).convert("RGB")
    frames.append((im, hold))

try:
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
        pg = b.contexts[0].pages[0]
        pg.set_viewport_size({"width": 1440, "height": 900})
        pg.get_by_role("button", name="Markdown を開く").wait_for(timeout=15000)
        # The window is transparent for macOS vibrancy; a CDP screenshot has nothing behind it, so paint the ground for the demo.
        pg.add_style_tag(content="body.electron{background:#f5f5f7 !important}")
        pg.wait_for_timeout(600)
        snap(pg, 1800)                                                    # 1. start screen
        pg.get_by_role("button", name="deck.md").hover(); pg.wait_for_timeout(300)
        snap(pg, 700)
        pg.get_by_role("button", name="deck.md").click()
        pg.locator(".nav-item").nth(6).wait_for(timeout=15000); pg.wait_for_timeout(900)
        snap(pg, 2000)                                                    # 2. the deck is open: thumbnails, preview, editor
        pg.locator(".nav-item").nth(3).click(); pg.wait_for_timeout(500)
        snap(pg, 1400)                                                    # 3. a thumbnail selects the slide, the editor follows
        pg.locator(".cm-content").click(); pg.keyboard.press("Escape")
        pg.keyboard.type("15G"); pg.keyboard.type("o"); pg.wait_for_timeout(200)
        for chunk in ["- 指標は", "チームで", "毎週見る"]:
            pg.keyboard.type(chunk); pg.wait_for_timeout(120); snap(pg, 450)   # 4. typing: the preview and the gauge follow
        pg.keyboard.press("Escape"); pg.wait_for_timeout(1700); snap(pg, 1400)  # autosaved
        # HTML5 drag and drop does not come through CDP mouse events, so the events are dispatched directly (the app's own handlers run).
        DND = """async ([from, to, phase]) => {
          const items = [...document.querySelectorAll('.nav-item')].map((e) => e.parentElement);
          const src = items[from], dst = items[to];
          const dt = window.__dt = window.__dt || new DataTransfer();
          const r = dst.getBoundingClientRect(); const at = { clientX: r.left + 40, clientY: r.bottom - 6 };
          if (phase === 'start') { src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); }
          if (phase === 'over') { dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...at })); }
          if (phase === 'drop') { dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...at })); }
        }"""
        pg.evaluate(DND, [3, 4, "start"]); pg.wait_for_timeout(120)
        pg.evaluate(DND, [3, 4, "over"]); pg.wait_for_timeout(200); snap(pg, 900)   # dragging: source dimmed, drop line under the target
        pg.evaluate(DND, [3, 4, "drop"]); pg.wait_for_timeout(700)
        snap(pg, 1800)                                                    # 5. reorder by drag: numbers renumber, markdown moved
        pg.get_by_role("button", name="画像", exact=True).click(); pg.wait_for_timeout(200)
        pg.get_by_role("button", name="3/4").click(); pg.get_by_role("button", name="左").click(); pg.wait_for_timeout(600)
        snap(pg, 1800)                                                    # 6. layout from the preview bar: {img=3/4 side=left}
        pg.get_by_role("button", name="マスター").click(); pg.wait_for_timeout(500)
        snap(pg, 1800)                                                    # 7. masters folder dialog
        pg.get_by_role("button", name="閉じる").click(); pg.wait_for_timeout(300)
        pg.get_by_role("button", name="書き出す").click()
        pg.get_by_text("out/deck.pptx を生成しました").wait_for(timeout=60000); pg.wait_for_timeout(400)
        snap(pg, 2400)                                                    # 8. export: python-pptx wrote out/deck.pptx
        b.close()
finally:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM); proc.wait(timeout=5)
    except Exception:
        try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception: pass

w0, h0 = frames[0][0].size
scale = WIDTH / w0
imgs = [f.resize((WIDTH, round(h0 * scale)), Image.LANCZOS).quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f, _ in frames]
durs = [d for _, d in frames]
OUT.parent.mkdir(parents=True, exist_ok=True)
imgs[0].save(OUT, save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True)
print(f"frames={len(imgs)} size={OUT.stat().st_size // 1024}KB total={sum(durs)/1000:.1f}s -> {OUT}")
shutil.rmtree(tmp, ignore_errors=True)
