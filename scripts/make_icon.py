"""Regenerate the app icon from docs/media/icon.svg.

    python3 scripts/make_icon.py        # needs requirements-dev.txt (playwright, pillow) and macOS iconutil

Writes build/icon.png (1024, used by electron-builder and the dev Dock), build/icon.icns (macOS bundle icon)
and docs/media/icon.png (256, README)."""
import io, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
svg = (ROOT / "docs" / "media" / "icon.svg").read_text(encoding="utf8")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1024, "height": 1024}, device_scale_factor=1)
    pg.set_content(f"<html><body style='margin:0;background:transparent'>{svg}</body></html>"); pg.wait_for_timeout(200)
    png = pg.screenshot(omit_background=True); b.close()
im = Image.open(io.BytesIO(png)).convert("RGBA")
(ROOT / "build").mkdir(exist_ok=True)
im.save(ROOT / "build" / "icon.png")
im.resize((256, 256), Image.LANCZOS).save(ROOT / "docs" / "media" / "icon.png")
tmp = Path(tempfile.mkdtemp()); iconset = tmp / "icon.iconset"; iconset.mkdir()
for size in (16, 32, 128, 256, 512):
    im.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
    im.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")
subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(ROOT / "build" / "icon.icns")], check=True)
shutil.rmtree(tmp, ignore_errors=True)
print("wrote build/icon.png, build/icon.icns, docs/media/icon.png")
