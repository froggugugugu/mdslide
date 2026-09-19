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


def test_a_font_that_cannot_draw_kanji_is_never_chosen(tmp_path, monkeypatch):
    """The theme's Latin font is on every Mac, so choosing by name alone took Helvetica and drew every label as
    tofu — matplotlib only warns about the missing glyphs, so the figure looked fine to every test we had."""
    monkeypatch.syspath_prepend(str(ROOT / "tools"))
    import mdslide_draw as m
    from matplotlib import font_manager

    monkeypatch.setattr(m, "ROOT", tmp_path)
    (tmp_path / "theme.json").write_text(json.dumps(  # minorJa is the font a master names; it is often not installed
        {"fonts": {"minorJa": "Noto Sans CJK JP", "minor": "Helvetica"}}), encoding="utf8")
    installed = {f.name for f in font_manager.fontManager.ttflist}
    capable = [n for n in ("Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic",
                           "Noto Sans CJK JP", "Noto Sans JP", "IPAexGothic", "Meiryo", "Arial Unicode MS")
               if n in installed and m._draws_kanji(n)]
    assert not m._draws_kanji("Helvetica")                 # the face that used to win
    if capable:                                            # a CJK face exists here, so one of them must be chosen
        assert m._draws_kanji(m._font()), m._font()


def test_help_lists_all_kinds(tmp_path):
    setup_folder(tmp_path)
    r = run(tmp_path, "--help")
    assert r.returncode == 0
    for k in ["flow", "venn", "pillars", "cycle", "matrix", "timeline"]:
        assert k in r.stdout
