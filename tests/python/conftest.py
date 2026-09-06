import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

W, H = 12192000, 6858000


@pytest.fixture
def master(tmp_path):
    src = ROOT / "examples" / "sample-master.pptx"
    dst = tmp_path / "master.pptx"
    dst.write_bytes(src.read_bytes())
    return dst


@pytest.fixture
def png(tmp_path):
    from PIL import Image
    d = tmp_path / "images"; d.mkdir(exist_ok=True)
    def make(name, w, h):
        p = d / name
        Image.new("RGB", (w, h), (10, 100, 80)).save(p)
        return p
    return make


def slide(kind, title, layout="text", body=None, master_layout=None, **extra):
    s = {"kind": kind, "layout": layout, "masterLayout": master_layout, "title": title,
         "body": body or [], "images": [], "notes": []}
    s.update(extra)
    return s


def geometry(side="right", width=0.5):
    content_x, content_y, content_w = int(0.05 * W), int(0.16 * W), int(0.9 * W)
    content_h = int(H - 0.05 * W - 0.16 * W)
    gap = int(0.03 * W)
    if width == 1:
        return {"side": side, "imageBox": {"x": content_x, "y": content_y, "w": content_w, "h": content_h},
                "body": None, "contentBottom": content_y + content_h, "gap": gap}
    box_w = int((content_w - gap) * width)
    text_w = content_w - gap - box_w
    box_x = content_x if side == "left" else content_x + content_w - box_w
    body_x = box_x + box_w + gap if side == "left" else content_x
    return {"side": side, "imageBox": {"x": box_x, "y": content_y, "w": box_w, "h": content_h},
            "body": {"x": body_x, "y": content_y, "w": text_w, "h": content_h}, "contentBottom": content_y + content_h, "gap": gap}


@pytest.fixture
def deck_json(tmp_path):
    def write(slides, version=2):
        p = tmp_path / "deck.json"
        p.write_text(json.dumps({"version": version, "slideSize": {"w": W, "h": H}, "meta": {"title": "T"}, "master": None, "slides": slides}, ensure_ascii=False), encoding="utf-8")
        return p
    return write
