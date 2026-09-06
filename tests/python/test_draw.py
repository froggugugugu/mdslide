import json
import subprocess
import sys
from pathlib import Path

from conftest import ROOT
from PIL import Image

SCRIPT = ROOT / "tools" / "mdslide_draw.py"


def setup_folder(tmp_path):
    (tmp_path / "tools").mkdir(); (tmp_path / "images").mkdir()
    (tmp_path / "tools" / "mdslide_draw.py").write_bytes(SCRIPT.read_bytes())
    (tmp_path / "theme.json").write_text(json.dumps({"palette": ["#112233", "#445566", "#778899"], "text": "#000000", "background": "#FFFFFF", "muted": "#888888", "fonts": {"minorJa": "Noto Sans CJK JP"}}), encoding="utf8")


def run(tmp_path, *args):
    return subprocess.run([sys.executable, "tools/mdslide_draw.py", *args], cwd=tmp_path, capture_output=True, text=True)


def test_every_kind_renders_a_transparent_16_9_png_with_theme_colours(tmp_path):
    setup_folder(tmp_path)
    cases = [
        ("flow", ["images/a.png", "課題", "分析", "施策", "--title", "流れ"]),
        ("venn", ["images/b.png", "開発", "運用", "品質", "--center", "DevOps"]),
        ("pillars", ["images/c.png", "速さ:自動化", "安全:レビュー"]),
        ("cycle", ["images/d.png", "計画", "実行", "計測", "改善"]),
        ("matrix", ["images/e.png", "--x", "手間", "--y", "効果", "A:0.2,0.8", "B:0.7,0.6"]),
        ("timeline", ["images/f.png", "9月:設計", "10月:実装"]),
    ]
    for kind, args in cases:
        r = run(tmp_path, kind, *args)
        assert r.returncode == 0, (kind, r.stderr)
        out = tmp_path / args[0]
        assert out.exists() and r.stdout.strip().endswith(args[0])
        im = Image.open(out).convert("RGBA")
        assert im.size == (1600, 900)
        assert im.getpixel((0, 0))[3] == 0  # transparent corner
        colours = {px[:3] for px in im.getdata() if px[3] > 250}
        if kind == "venn":  # translucent fills: check the alpha-blended hue instead of the exact value
            assert any(px[3] > 100 and abs(px[0] - 0x11) < 40 and abs(px[2] - 0x33) < 40 for px in im.getdata()), kind
        else:
            assert (0x11, 0x22, 0x33) in colours, kind  # first palette colour used
        assert not any(c[0] > 200 and c[1] < 60 and c[2] < 60 for c in colours), kind  # nothing off-palette like pure red


def test_falls_back_to_defaults_without_theme_json(tmp_path):
    setup_folder(tmp_path)
    (tmp_path / "theme.json").unlink()
    r = run(tmp_path, "flow", "images/x.png", "a", "b")
    assert r.returncode == 0 and (tmp_path / "images" / "x.png").exists()


def test_help_lists_all_kinds(tmp_path):
    setup_folder(tmp_path)
    r = run(tmp_path, "--help")
    assert r.returncode == 0
    for k in ["flow", "venn", "pillars", "cycle", "matrix", "timeline"]:
        assert k in r.stdout
