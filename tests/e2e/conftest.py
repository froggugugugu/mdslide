"""End-to-end fixtures. Web tests run the built renderer in headless Chromium with an OPFS-backed folder.
Electron tests launch the real app with a temp workspace and drive it over CDP."""
import base64
import io
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def png_b64(w, h, color=(30, 110, 86), noise=False):
    """Flat 'screenshot-like' PNG by default; noise=True makes a photo-like image with many colours."""
    from PIL import Image, ImageDraw
    if noise:
        import random
        random.seed(1)
        im = Image.frombytes("RGB", (w, h), bytes(random.getrandbits(8) for _ in range(w * h * 3)))
    else:
        im = Image.new("RGB", (w, h), color)
        ImageDraw.Draw(im).rectangle([8, 8, w - 8, h - 8], outline=(255, 255, 255), width=4)
    b = io.BytesIO(); im.save(b, "PNG")
    return base64.b64encode(b.getvalue()).decode()


PASTE_JS = """(b64)=>{const bin=atob(b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  const f=new File([u],'shot.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);
  document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));}"""


def wait_http(url, timeout=60):
    for _ in range(timeout * 2):
        try:
            urllib.request.urlopen(url, timeout=1); return True
        except Exception:
            time.sleep(0.5)
    return False


@pytest.fixture(scope="session")
def web_server():
    subprocess.run(["npx", "vite", "build"], cwd=ROOT, check=True, capture_output=True)
    # Bind 127.0.0.1 explicitly: with Node 17+ "localhost" resolves to ::1 first and the tests connect over IPv4.
    log = tempfile.NamedTemporaryFile("w", prefix="mdslide-preview-", suffix=".log", delete=False)
    proc = subprocess.Popen(["npx", "vite", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    assert wait_http("http://127.0.0.1:4173/"), f"vite preview did not start:\n{Path(log.name).read_text()}"
    yield "http://127.0.0.1:4173"
    proc.terminate()


@pytest.fixture
def web_page(web_server):
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1500, "height": 900})
        # Stand in for the folder picker with the origin-private file system, which implements the same handle API.
        ctx.add_init_script("window.showDirectoryPicker = () => navigator.storage.getDirectory();")
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        ctx.add_init_script("localStorage.setItem('help:seen','1');")
        page.goto(web_server); page.wait_for_timeout(600)
        page.errors = errors
        yield page
        b.close()


@pytest.fixture(scope="session")
def display():
    """A DISPLAY for Electron. On Linux without one, start Xvfb."""
    if os.environ.get("DISPLAY") or os.name != "posix" or shutil.which("Xvfb") is None:
        yield os.environ.get("DISPLAY"); return
    proc = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1600x900x24"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    yield ":99"
    proc.terminate()


@pytest.fixture
def electron_app(tmp_path, display):
    """Launch the built Electron app on a fresh workspace folder; yields (page, workspace_dir)."""
    if not (ROOT / "out" / "main" / "main.js").exists():
        subprocess.run(["npx", "electron-vite", "build"], cwd=ROOT, check=True, capture_output=True)
    ws = tmp_path / "ws"; ws.mkdir()
    shutil.copy(ROOT / "examples" / "sample-master.pptx", ws / "master.pptx")
    # A fake `claude` on PATH so the auto-started session is deterministic; the real one needs auth.
    fake_bin = tmp_path / "bin"; fake_bin.mkdir()
    # It echoes what it gets; a prompt mentioning notes/ rewrites deck.md from notes/*.md and draws one figure with the real tool.
    (fake_bin / "claude").write_text(
        "#!/bin/sh\necho 'FAKE CLAUDE READY'\nwhile read line; do\n"
        "  echo \"claude got: $line\"\n"
        "  case \"$line\" in\n"
        "    *notes/*) printf -- '---\\ntitle: 整形済み\\n---\\n\\n# 背景\\n\\n## メモから {img=1/2 side=right}\\n\\n' > deck.md; "
        "for f in notes/*.md; do sed 's/^/- /' \"$f\" >> deck.md; done; "
        # Same interpreter as pytest: a login shell on macOS reorders PATH (path_helper) and `python3` may become the system one without matplotlib.
        f"{sys.executable} tools/mdslide_draw.py flow images/flow.png 課題 分析 施策 >/dev/null 2>&1 && printf '\\n![流れ](images/flow.png)\\n' >> deck.md ;;\n"
        "    *) printf '\\n## %s\\n\\n- Claude Code added\\n' \"$line\" >> deck.md ;;\n"
        "  esac\ndone\n", encoding="utf8")
    (fake_bin / "claude").chmod(0o755)
    cfg = tmp_path / "config" / "settings.json"  # isolated settings file per test
    cfg.parent.mkdir(); cfg.write_text('{"version": 1}\n', encoding="utf8")  # present: skips migration of the shared userData
    env = {**os.environ, "ELECTRON_DISABLE_SECURITY_WARNINGS": "1", "PATH": f"{fake_bin}:{os.environ.get('PATH', '')}", "SHELL": "/bin/bash", "MDSLIDE_CONFIG": str(cfg)}
    if display: env["DISPLAY"] = display
    port = 9333
    # Launch the Electron binary directly (not through npx) so terminating the process really ends the app.
    # require('electron') may print "Downloading Electron binary..." before the path when the binary was not fetched at install time.
    binary = subprocess.run(["node", "-e", "process.stdout.write(require('electron'))"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip().splitlines()[-1]
    proc = subprocess.Popen([binary, ".", str(ws), "--no-sandbox", f"--remote-debugging-port={port}"], cwd=ROOT, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    assert wait_http(f"http://127.0.0.1:{port}/json/version"), "electron did not expose CDP"
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
        page = b.contexts[0].pages[0]
        page.set_viewport_size({"width": 1500, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.errors = errors
        page.wait_for_timeout(1500)
        yield page, ws
        b.close()
    import signal
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=5)
    except (subprocess.TimeoutExpired, ProcessLookupError):
        try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except ProcessLookupError: pass
    for _ in range(20):  # wait for the CDP port to free up before the next launch
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=0.5); time.sleep(0.5)
        except Exception:
            break
