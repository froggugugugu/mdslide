#!/usr/bin/env python3
"""mdslide_draw.py — theme-aware PNG figures for a deck folder.

An AI agent (or a person) calls these helpers to produce figures that match the deck's master theme.
Colours and fonts come from theme.json next to deck.md (written by mdslide from master.pptx).

    python3 tools/mdslide_draw.py flow    images/flow.png    "課題" "分析" "施策" "効果"
    python3 tools/mdslide_draw.py venn    images/venn.png    "開発" "運用" "品質"   --center "DevOps"
    python3 tools/mdslide_draw.py pillars images/pillars.png "速さ:自動化" "安全:レビュー" "継続:計測"
    python3 tools/mdslide_draw.py cycle   images/cycle.png   "計画" "実行" "計測" "改善"
    python3 tools/mdslide_draw.py matrix  images/matrix.png  --x "手間" --y "効果" "A:0.2,0.8" "B:0.7,0.6"
    python3 tools/mdslide_draw.py timeline images/timeline.png "9月:設計" "10月:実装" "11月:展開"

Or import it:  from mdslide_draw import flow, venn, pillars, cycle, matrix, timeline, theme

All figures: 16:9, 1600px wide, transparent background, no text smaller than 22pt, palette only from theme.json.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent  # the deck folder
DEFAULT_THEME = {
    "palette": ["#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#64D2FF", "#FF453A"],
    "text": "#1D1D1F", "background": "#FFFFFF", "muted": "#8E8E93", "fonts": {"major": "Helvetica", "minor": "Helvetica"},
}


def theme() -> dict:
    p = ROOT / "theme.json"
    if p.exists():
        try:
            t = {**DEFAULT_THEME, **json.loads(p.read_text(encoding="utf-8"))}
            return t
        except Exception:
            pass
    return DEFAULT_THEME


def _font() -> str:
    """Prefer the theme's Japanese font, then common CJK fonts, then whatever matplotlib has."""
    t = theme()
    wanted = [t.get("fonts", {}).get("minorJa"), t.get("fonts", {}).get("minor"),
              "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", "Noto Sans JP", "IPAexGothic", "Meiryo", "Noto Sans CJK SC"]
    available = {f.name for f in font_manager.fontManager.ttflist}
    for w in wanted:
        if w and w in available:
            return w
    return plt.rcParams["font.family"][0]


def _fig(w=16, h=9):
    plt.rcParams["font.family"] = _font()
    fig = plt.figure(figsize=(w, h), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, w); ax.set_ylim(0, h); ax.axis("off")
    fig.patch.set_alpha(0)
    return fig, ax


def _save(fig, out: str | Path):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=100, transparent=True)
    plt.close(fig)
    return str(out)


def _text(ax, x, y, s, size=26, color=None, weight="normal", ha="center", va="center"):
    ax.text(x, y, s, fontsize=size, color=color or theme()["text"], ha=ha, va=va, fontweight=weight, wrap=True)


def flow(steps: list[str], out: str, *, title: str | None = None) -> str:
    """Left-to-right process: rounded boxes joined by arrows."""
    t = theme(); fig, ax = _fig()
    n = max(1, len(steps)); gap = 0.9
    bw = min(3.6, (16 - 1.2 - gap * (n - 1)) / n); bh = 2.2
    y = 4.6 if title else 4.2
    total = n * bw + (n - 1) * gap; x0 = (16 - total) / 2
    for i, s in enumerate(steps):
        x = x0 + i * (bw + gap)
        ax.add_patch(FancyBboxPatch((x, y - bh / 2), bw, bh, boxstyle="round,pad=0.02,rounding_size=0.35", fc=t["palette"][i % len(t["palette"])], ec="none"))
        _text(ax, x + bw / 2, y, s, size=26, color=t["background"], weight="bold")
        if i < n - 1:
            ax.add_patch(FancyArrowPatch((x + bw + 0.12, y), (x + bw + gap - 0.12, y), arrowstyle="-|>", mutation_scale=30, lw=3, color=t["muted"]))
    if title:
        _text(ax, 8, 7.6, title, size=30, weight="bold")
    return _save(fig, out)


def venn(labels: list[str], out: str, *, center: str | None = None) -> str:
    """2- or 3-set Venn with translucent theme colours."""
    t = theme(); fig, ax = _fig()
    r = 3.0
    if len(labels) == 2:
        centers = [(6.2, 4.5), (9.8, 4.5)]
    else:
        centers = [(6.5, 5.4), (9.5, 5.4), (8.0, 2.9)]
    for i, (c, lab) in enumerate(zip(centers, labels)):
        ax.add_patch(Circle(c, r, fc=t["palette"][i % len(t["palette"])], ec="none", alpha=0.55))
    offsets = [(-1.6, 1.6), (1.6, 1.6), (0, -2.0)]
    for (c, lab, o) in zip(centers, labels, offsets):
        _text(ax, c[0] + o[0], c[1] + o[1], lab, size=28, weight="bold")
    if center:
        cx = sum(c[0] for c in centers) / len(centers); cy = sum(c[1] for c in centers) / len(centers)
        _text(ax, cx, cy, center, size=26, weight="bold", color=t["background"])
    return _save(fig, out)


def pillars(items: list[str], out: str, *, title: str | None = None) -> str:
    """Columns of 'heading:body' cards."""
    t = theme(); fig, ax = _fig()
    n = max(1, len(items)); gap = 0.6
    w = (16 - 1.4 - gap * (n - 1)) / n; h = 5.2; y = 1.4
    for i, it in enumerate(items):
        head, _, body = it.partition(":")
        x = 0.7 + i * (w + gap)
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.3", fc=t["background"], ec=t["palette"][i % len(t["palette"])], lw=4))
        ax.add_patch(FancyBboxPatch((x, y + h - 1.3), w, 1.3, boxstyle="round,pad=0.02,rounding_size=0.3", fc=t["palette"][i % len(t["palette"])], ec="none"))
        _text(ax, x + w / 2, y + h - 0.65, head, size=26, color=t["background"], weight="bold")
        _text(ax, x + w / 2, y + (h - 1.3) / 2, body.replace("/", "\n"), size=24)
    if title:
        _text(ax, 8, 7.8, title, size=30, weight="bold")
    return _save(fig, out)


def cycle(steps: list[str], out: str) -> str:
    """Steps around a circle with arrows."""
    t = theme(); fig, ax = _fig()
    n = max(2, len(steps)); cx, cy, R = 8, 4.5, 2.9
    pts = [(cx + R * math.cos(math.pi / 2 - 2 * math.pi * i / n), cy + R * math.sin(math.pi / 2 - 2 * math.pi * i / n)) for i in range(n)]
    for i, (p, s) in enumerate(zip(pts, steps)):
        ax.add_patch(Circle(p, 1.15, fc=t["palette"][i % len(t["palette"])], ec="none"))
        _text(ax, p[0], p[1], s, size=24, color=t["background"], weight="bold")
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        ax.add_patch(FancyArrowPatch(a, b, arrowstyle="-|>", mutation_scale=28, lw=3, color=t["muted"], shrinkA=64, shrinkB=64, connectionstyle="arc3,rad=0.25"))
    return _save(fig, out)


def matrix(points: list[str], out: str, *, x: str = "", y: str = "", quadrants: list[str] | None = None) -> str:
    """2x2 matrix; points are 'label:x,y' with x,y in 0..1."""
    t = theme(); fig, ax = _fig()
    L, B, W, H = 2.2, 1.2, 12, 6.6
    ax.add_patch(FancyBboxPatch((L, B), W, H, boxstyle="square,pad=0", fc="none", ec=t["muted"], lw=2))
    ax.plot([L + W / 2, L + W / 2], [B, B + H], color=t["muted"], lw=1.5, ls="--")
    ax.plot([L, L + W], [B + H / 2, B + H / 2], color=t["muted"], lw=1.5, ls="--")
    _text(ax, L + W / 2, B - 0.6, x, size=24, color=t["muted"]); ax.text(L - 0.6, B + H / 2, y, fontsize=24, color=t["muted"], rotation=90, ha="center", va="center")
    for q, lab in zip([(L + W * 0.25, B + H * 0.75), (L + W * 0.75, B + H * 0.75), (L + W * 0.25, B + H * 0.25), (L + W * 0.75, B + H * 0.25)], quadrants or []):
        _text(ax, q[0], q[1] + H * 0.18, lab, size=22, color=t["muted"])
    for i, p in enumerate(points):
        lab, _, coords = p.partition(":")
        px, py = (float(v) for v in coords.split(","))
        X, Y = L + W * px, B + H * py
        ax.add_patch(Circle((X, Y), 0.32, fc=t["palette"][i % len(t["palette"])], ec="none"))
        _text(ax, X, Y + 0.6, lab, size=24, weight="bold")
    return _save(fig, out)


def timeline(items: list[str], out: str) -> str:
    """Horizontal timeline; items are 'when:what'."""
    t = theme(); fig, ax = _fig()
    n = max(1, len(items)); y = 4.5; x0, x1 = 1.2, 14.8
    ax.plot([x0, x1], [y, y], color=t["muted"], lw=4)
    for i, it in enumerate(items):
        when, _, what = it.partition(":")
        x = x0 + (x1 - x0) * (i + 0.5) / n
        ax.add_patch(Circle((x, y), 0.36, fc=t["palette"][i % len(t["palette"])], ec="none"))
        _text(ax, x, y + 1.1, when, size=24, weight="bold")
        _text(ax, x, y - 1.2, what, size=24)
    return _save(fig, out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kind", choices=["flow", "venn", "pillars", "cycle", "matrix", "timeline"])
    ap.add_argument("out")
    ap.add_argument("--title"); ap.add_argument("--center"); ap.add_argument("--x", default=""); ap.add_argument("--y", default="")
    ap.add_argument("--quadrant", action="append")
    a, items = ap.parse_known_args(argv)   # items may come after options
    a.items = [i for i in items if not i.startswith("--")]
    if a.kind == "flow": out = flow(a.items, a.out, title=a.title)
    elif a.kind == "venn": out = venn(a.items, a.out, center=a.center)
    elif a.kind == "pillars": out = pillars(a.items, a.out, title=a.title)
    elif a.kind == "cycle": out = cycle(a.items, a.out)
    elif a.kind == "matrix": out = matrix(a.items, a.out, x=a.x, y=a.y, quadrants=a.quadrant)
    else: out = timeline(a.items, a.out)
    print(out)


if __name__ == "__main__":
    sys.exit(main())
