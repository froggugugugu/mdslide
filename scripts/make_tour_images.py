#!/usr/bin/env python3
"""Capture the landing page tour (docs/media/tour/*.webp) by driving the real Electron app over CDP.

    npm run build && python3 scripts/make_tour_images.py        # needs requirements-dev.txt (playwright, pillow)

One still per step from the start screen to the export, in the light look at 1440x900, saved as WebP 1200px wide.
The deck uses the decorated example master so the preview shows what a company master looks like. The app runs
against a throwaway workspace, masters folder and settings file; nothing on the machine is touched. The steps follow
scripts/make_demo_gif.py, and the carousel on the landing page (.github/pages/index.html) shows them in this order."""
import io, json, os, re, shutil, signal, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "media" / "tour"
WIDTH = 1200  # image width in px


def wait_http(url, timeout=60):
    for _ in range(timeout * 2):
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.5)
    return False


# Sample deck text from the app's built-in sample (the template literal in src/sample.ts).
SAMPLE = re.search(r"SAMPLE_MARKDOWN = `([\s\S]*?)`;", (ROOT / "src" / "sample.ts").read_text(encoding="utf8")).group(1)

tmp = Path(tempfile.mkdtemp(prefix="mdslide-tour-"))
ws = tmp / "資料" / "四半期報告"
ws.mkdir(parents=True)
DRAW = [sys.executable, str(ROOT / "tools" / "mdslide_draw.py")]
# The sample references images/overview.png; draw it with the deck's own figure tool so the slides are complete.
subprocess.run(DRAW + ["cycle", str(ws / "images" / "overview.png"), "計画", "実行", "計測", "改善"], cwd=ws, check=True, capture_output=True)
# A 24pt body keeps each sample slide on one page, and drawn figures replace the TODO placeholders, so the tour shows
# layouts rather than auto-split continuations and the export finishes without warnings.
deck = SAMPLE.replace("\n---\n", "\nfontSize: 24\n---\n", 1)
for i, label in enumerate(re.findall(r"!\[TODO ([^\]]*)\]\(\)", deck), 1):
    subprocess.run(DRAW + ["flow", str(ws / "images" / f"figure-{i}.png"), "コミット", "ビルド", "テスト", "デプロイ"], cwd=ws, check=True, capture_output=True)
    deck = deck.replace(f"![TODO {label}]()", f"![{label}](images/figure-{i}.png)", 1)
(ws / "deck.md").write_text(deck, encoding="utf8")
lines = deck.split("\n")
background = next(i for i, l in enumerate(lines) if l.startswith("## 取り組みの背景"))
last_bullet = background
for i in range(background + 1, len(lines)):
    if lines[i].startswith("#"):
        break
    if lines[i].startswith("- "):
        last_bullet = i
masters = tmp / "masters"
masters.mkdir()
for name in ("decorated-master.pptx", "sample-master.pptx"):
    shutil.copy(ROOT / "examples" / name, masters / name)
cfg = tmp / "config" / "settings.json"
cfg.parent.mkdir()
cfg.write_text(json.dumps({
    "version": 1, "help": {"seen": True},
    "console": {"open": False, "autoStart": False, "height": 260},
    "workspace": {"lastPath": None, "lastDeckFile": None, "recent": [{"path": str(ws), "deckFile": "deck.md"}]},
    "masters": {"dir": str(masters), "default": "decorated-master.pptx"},
    "editor": {"vim": True, "width": None},
    "appearance": {"theme": "light"},  # the tour is always the light look, whatever the machine's appearance
}, ensure_ascii=False), encoding="utf8")
env = {**os.environ, "ELECTRON_DISABLE_SECURITY_WARNINGS": "1", "MDSLIDE_CONFIG": str(cfg), "SHELL": "/bin/zsh"}
binary = subprocess.run(["node", "-e", "process.stdout.write(require('electron'))"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
port = 9445
proc = subprocess.Popen([binary, ".", "--no-sandbox", f"--remote-debugging-port={port}"], cwd=ROOT, env=env,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
assert wait_http(f"http://127.0.0.1:{port}/json/version"), "electron did not expose CDP"


# The throwaway folders would show as long temporary paths; show them as a person's folders would look.
ALIAS = """([pattern, shown]) => {
  const re = new RegExp(pattern, 'g');
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) n.nodeValue = n.nodeValue.replace(re, shown);
  for (const el of document.querySelectorAll('[title]')) el.title = el.title.replace(re, shown);
}"""


def tidy(pg):
    for real, shown in ((ws, "~/Documents/資料/四半期報告"), (masters, "~/.config/mdslide/masters")):
        for form in {str(real), str(real.resolve())}:
            pg.evaluate(ALIAS, [re.escape(form), shown])


def snap(pg, name):
    tidy(pg)
    im = Image.open(io.BytesIO(pg.screenshot())).convert("RGB")
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(OUT / f"{name}.webp", "WEBP", quality=84, method=6)
    print(f"{name}.webp {(OUT / f'{name}.webp').stat().st_size // 1024}KB")


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

try:
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
        pg = b.contexts[0].pages[0]
        pg.set_viewport_size({"width": 1440, "height": 900})
        pg.get_by_role("button", name="Markdown を開く").wait_for(timeout=15000)
        # The window is transparent for macOS vibrancy; a CDP screenshot has nothing behind it, so paint the ground.
        pg.add_style_tag(content="body.electron{background:#f5f5f7 !important}")
        pg.wait_for_timeout(800)
        snap(pg, "01-start")                                                   # start screen with the recent deck
        pg.get_by_role("button", name="deck.md").click()
        pg.locator(".nav-item").nth(6).wait_for(timeout=15000)
        pg.wait_for_timeout(1200)
        pg.locator(".nav-item").nth(3).click()
        pg.wait_for_timeout(800)
        snap(pg, "02-open")                                                    # thumbnails, preview on the master, editor
        pg.locator(".cm-content").click()
        pg.keyboard.press("Escape")
        pg.keyboard.type(f"{last_bullet + 1}G")
        pg.keyboard.type("o")
        pg.keyboard.type("- CI の結果をチームで毎週見る")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(1900)
        snap(pg, "03-write")                                                   # the preview and the gauge follow; autosaved
        pg.evaluate(DND, [3, 4, "start"])
        pg.wait_for_timeout(150)
        pg.evaluate(DND, [3, 4, "over"])
        pg.wait_for_timeout(300)
        snap(pg, "04-reorder")                                                 # dragging: the block dims, the drop line shows
        pg.evaluate(DND, [3, 4, "drop"])
        pg.wait_for_timeout(900)
        pg.locator(".nav-item").nth(3).click()                                # the slide with the figure, now above
        pg.wait_for_timeout(500)
        pg.get_by_role("button", name="画像", exact=True).click()
        pg.wait_for_timeout(250)
        pg.get_by_role("button", name="1/2").click()                             # 1/2 keeps the body on one slide
        pg.get_by_role("button", name="左").click()
        pg.wait_for_timeout(2200)                                              # autosaved
        snap(pg, "05-layout")                                                  # {img=1/2 side=left} from the preview bar
        pg.get_by_role("button", name="マスター", exact=True).click()
        sheet = pg.get_by_role("dialog", name="設定")
        sheet.wait_for(timeout=5000)
        pg.wait_for_timeout(900)
        snap(pg, "06-master")                                                  # the masters folder in the settings sheet
        sheet.get_by_role("button", name="閉じる").click()
        pg.wait_for_timeout(400)
        pg.get_by_role("button", name="書き出す").click()
        pg.get_by_text("out/deck.pptx を生成しました").wait_for(timeout=60000)
        pg.wait_for_timeout(600)
        snap(pg, "07-export")                                                  # python-pptx wrote out/deck.pptx
        b.close()
finally:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=5)
    except Exception:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:
            pass
    shutil.rmtree(tmp, ignore_errors=True)
