#!/usr/bin/env python3
"""Generate a pptx from mdslide's deck.json using the imported master as the base package.

Usage:
    python tools/export_pptx.py deck.json --master master.pptx -o out.pptx [--assets ./images-root]

The master's theme, fonts, colors, and logos are preserved because slides are added
on top of the master's own slideLayouts. Existing slides in the master are removed.

Contract: see src/export/exportJson.ts (ExportDeck, version 1).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import copy

from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

try:
    from PIL import Image as PILImage
except ImportError:  # Pillow ships with python-pptx, but stay defensive
    PILImage = None

BULLET = re.compile(r"^(\s*)[-*+]\s+(.*)$")
INLINE = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`)")
TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{2,}")


def table_row(line: str):
    t = line.strip()
    if len(t) < 2 or not (t.startswith("|") and t.endswith("|")):
        return None
    return [c.strip() for c in t[1:-1].split("|")]


def split_tables(lines: list[str]):
    """Return (text_lines, tables). Tables are lists of rows (separator rows dropped)."""
    text, tables, cur = [], [], []
    for line in lines:
        row = table_row(line)
        if row is not None:
            if not TABLE_SEP.match(line):
                cur.append(row)
            continue
        if cur:
            tables.append(cur); cur = []
        text.append(line)
    if cur:
        tables.append(cur)
    return text, tables


def add_table(slide, ph, rows, keep_text: bool):
    """Place a native table in the placeholder's area. If the placeholder keeps text, use the lower 60%."""
    left, top, width, height = ph.left, ph.top, ph.width, ph.height
    if keep_text:
        top, height = top + int(height * 0.4), int(height * 0.6)
    cols = max(len(r) for r in rows)
    shape = slide.shapes.add_table(len(rows), cols, left, top, width, min(height, Pt(24) * len(rows)))
    for i, r in enumerate(rows):
        for j in range(cols):
            cell = shape.table.cell(i, j)
            cell.text = ""
            add_runs(cell.text_frame.paragraphs[0], r[j] if j < len(r) else "")
            for run in cell.text_frame.paragraphs[0].runs:
                run.font.size = Pt(12)
                if i == 0:
                    run.font.bold = True


def find_layout(prs, name: str | None, kind: str):
    if name:
        for layout in prs.slide_layouts:
            if layout.name == name:
                return layout
    # Fallbacks by convention when the app could not resolve a layout.
    prefixes = {"cover": "cover", "agenda": "agenda", "section": "section", "body": "body-text"}
    for layout in prs.slide_layouts:
        if layout.name.lower().replace(" ", "").startswith(prefixes[kind]):
            return layout
    sys.exit(f"レイアウトが見つかりません: {name or kind}。マスターのレイアウト名を確認してください。")


def placeholders_by_type(slide):
    out: dict[str, list] = {}
    for ph in slide.placeholders:
        t = ph.placeholder_format.type
        key = str(t).split(".")[-1].split(" ")[0].lower()  # e.g. "title", "body", "picture", "subtitle", "object"
        out.setdefault(key, []).append(ph)
    return out


def add_runs(paragraph, text: str):
    """Bold (**x**) and code (`x`) inline markers; everything else plain, inheriting layout style."""
    for part in INLINE.split(text):
        if not part:
            continue
        run = paragraph.add_run()
        if part.startswith("**"):
            run.text, run.font.bold = part[2:-2], True
        elif part.startswith("`"):
            run.text, run.font.name = part[1:-1], "Consolas"
        else:
            run.text = part


def fill_text(ph, lines: list[str]):
    tf = ph.text_frame
    tf.clear()
    first = True
    for line in lines:
        if not line.strip():
            continue
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        m = BULLET.match(line)
        if m:
            p.level = min(len(m.group(1)) // 2, 4)
            add_runs(p, m.group(2))
        else:
            add_runs(p, line)
    if first:  # nothing written: leave the placeholder empty but present
        tf.paragraphs[0].text = ""


def fill_picture(ph, src: str, assets: Path):
    if not src:
        print("warning: image placeholder still empty (![...]())", file=sys.stderr)
        return
    path = (assets / src) if not Path(src).is_absolute() else Path(src)
    if not path.exists():
        print(f"warning: image not found, placeholder left empty: {path}", file=sys.stderr)
        return
    try:
        ph.insert_picture(str(path))
    except Exception as e:  # SVG/EMF or non-picture placeholder
        print(f"warning: could not insert {path}: {e}", file=sys.stderr)


# ---- fit estimate (mirrors src/model/fit.ts) ----
LINE_SPACING, BULLET_INDENT_EM, EMPTY_LINE = 1.2, 1.5, 0.5
IMAGE_ONLY = re.compile(r"^\s*!\[[^\]]*\]\([^)]*\)\s*$")


def char_width_em(ch: str) -> float:
    c = ord(ch)
    if ch in " \t":
        return 0.3
    if c < 0x2E80 or 0xFF61 <= c <= 0xFF9F:
        return 0.55
    return 1.0


def display_lines(line: str, width_em: float) -> float:
    if IMAGE_ONLY.match(line):
        return 0
    if not line.strip():
        return EMPTY_LINE
    if line.strip().startswith("|"):
        return 0 if TABLE_SEP.match(line) else 1
    m = BULLET.match(line)
    indent = (len(m.group(1)) // 2 + 1) * BULLET_INDENT_EM if m else 0
    text = (m.group(2) if m else line).replace("**", "").replace("`", "")
    avail = max(width_em - indent, 4)
    return max(1, -(-sum(char_width_em(ch) for ch in text) // avail))


def estimate_lines(lines: list[str], width_em: float) -> float:
    return sum(display_lines(l, width_em) for l in lines)


def capacity_lines(height_pt: float, font_pt: float) -> int:
    return max(1, int(height_pt // (font_pt * LINE_SPACING)))


def apply_font_size(ph, font_pt: float | None):
    """Explicit size on every run so a per-slide {size=N} survives regardless of the layout's defaults."""
    if not font_pt:
        return
    for p in ph.text_frame.paragraphs:
        for r in p.runs:
            r.font.size = Pt(font_pt)


def check_fit(slide_title: str, ph, lines: list[str], font_pt: float | None, fit: dict | None = None):
    """Warn when the body is estimated to overflow. Uses the app's estimate from deck.json when there is one (it counts
    the master's line and paragraph spacing, the text insets and the footer); otherwise the plain model below."""
    if not font_pt or not lines:
        return
    if fit and "used" in fit and "capacity" in fit:
        used, cap = float(fit["used"]), int(fit["capacity"])
    else:
        width_em = max(4.0, (ph.width / 12700) / font_pt)
        used, cap = estimate_lines(lines, width_em), capacity_lines(ph.height / 12700, font_pt)
    if used > cap + 1e-9:
        print(f"warning: '{slide_title}' body is estimated at {used:.1f} lines but the box fits {cap} at {font_pt:g}pt", file=sys.stderr)


def image_size(path: Path) -> tuple[int, int] | None:
    if PILImage is None:
        return None
    try:
        with PILImage.open(path) as im:
            return im.size
    except Exception:
        return None


def fit_rect(box: dict, aspect: float, side: str) -> tuple[int, int, int, int]:
    """Fit an image of `aspect` (w/h) into box (EMU dict), anchored top and to `side`. Mirrors src/layouts/geometry.ts."""
    w = box["w"]; h = int(w / aspect)
    if h > box["h"]:
        h = box["h"]; w = int(h * aspect)
    x = box["x"] if side == "left" else box["x"] + box["w"] - w
    return x, box["y"], w, h


def place_image_slide(slide, s: dict, bodies: list, assets: Path):
    """Image slide: picture as a free shape fitted into geometry.imageBox; body placeholder resized to the text area."""
    g = s["geometry"]
    img = (s.get("images") or [{}])[0]
    src = img.get("src", "")
    path = (assets / src) if src and not Path(src).is_absolute() else Path(src) if src else None
    aspect = 16 / 9
    if path and path.exists():
        size = image_size(path)
        if size:
            aspect = size[0] / size[1]
    x, y, w, h = fit_rect(g["imageBox"], aspect, g["side"])
    if path and path.exists():
        try:
            slide.shapes.add_picture(str(path), Emu(x), Emu(y), Emu(w), Emu(h))
        except Exception as e:
            print(f"warning: could not insert {path}: {e}", file=sys.stderr)
    elif src:
        print(f"warning: image not found: {path}", file=sys.stderr)
    else:
        print(f"warning: image placeholder still empty on '{s['title']}'", file=sys.stderr)

    body_rect = g["body"]
    if body_rect is None:  # full width: text under the picture if room remains
        top = y + h + g["gap"]
        height = g["contentBottom"] - top
        if height >= g["gap"] * 2:
            body_rect = {"x": g["imageBox"]["x"], "y": top, "w": g["imageBox"]["w"], "h": height}
    text_lines = [l for l in s["body"] if l.strip()]
    if bodies:
        ph = bodies[0]
        if body_rect and text_lines:
            ph.left, ph.top, ph.width, ph.height = Emu(body_rect["x"]), Emu(body_rect["y"]), Emu(body_rect["w"]), Emu(body_rect["h"])
            text, tables = split_tables(s["body"])
            fill_text(ph, text)
            apply_font_size(ph, s.get("fontPt"))
            check_fit(s["title"], ph, text, s.get("fontPt"), s.get("fit"))
            for rows in tables:
                add_table(slide, ph, rows, keep_text=bool([t for t in text if t.strip()]))
        else:
            if text_lines:
                print(f"warning: no room for text under the full-width image on '{s['title']}'", file=sys.stderr)
            ph.text_frame.text = ""  # removed by the cleanup pass


def split_columns(lines: list[str]) -> tuple[list[str], list[str]]:
    for i, l in enumerate(lines):
        if not l.strip() and i > 0:
            return lines[:i], lines[i + 1:]
    mid = (len(lines) + 1) // 2
    return lines[:mid], lines[mid:]


def add_footer_placeholders(slide, layout, number: int, date: str | None):
    """python-pptx clones no date / footer / slide-number placeholders from the layout; copy them so the slides carry the
    master's footer the way PowerPoint's own slides do. The slide number gets its number (kept as a field, so PowerPoint
    keeps it live), the date becomes the deck's date as plain text (a date field would silently turn into "today"), and
    a date placeholder is skipped when the deck has no date. Empty footers are removed with the other untouched placeholders."""
    for ph in layout.placeholders:
        t = ph.placeholder_format.type
        if t not in (PP_PLACEHOLDER.DATE, PP_PLACEHOLDER.FOOTER, PP_PLACEHOLDER.SLIDE_NUMBER):
            continue
        if t == PP_PLACEHOLDER.DATE and not date:
            continue
        el = copy.deepcopy(ph._element)
        if t == PP_PLACEHOLDER.FOOTER and not ph.text_frame.text.strip():
            # A fixed footer is usually typed on the master, not on every layout: take the master's text (and formatting).
            for mph in layout.slide_master.placeholders:
                if mph.placeholder_format.type == PP_PLACEHOLDER.FOOTER and mph.text_frame.text.strip():
                    el.remove(el.txBody)
                    el.append(copy.deepcopy(mph._element.txBody))
                    break
        slide.shapes._spTree.append(el)
        shape = slide.shapes[-1]
        fields = list(el.iter(qn("a:fld")))
        if t == PP_PLACEHOLDER.SLIDE_NUMBER:
            for f in fields:
                tnode = f.find(qn("a:t"))
                if tnode is None:
                    tnode = etree.SubElement(f, qn("a:t"))
                tnode.text = str(number)
            if not fields:
                shape.text_frame.text = str(number)
        elif t == PP_PLACEHOLDER.DATE:
            for f in fields:
                run = etree.Element(qn("a:r"))
                rpr = f.find(qn("a:rPr"))
                if rpr is not None:
                    run.append(copy.deepcopy(rpr))
                etree.SubElement(run, qn("a:t")).text = date
                f.getparent().replace(f, run)
            if not shape.text_frame.text.strip():
                shape.text_frame.text = date


def remove_all_slides(prs):
    sldIdLst = prs.slides._sldIdLst
    for sldId in list(sldIdLst):
        prs.part.drop_rel(sldId.rId)
        sldIdLst.remove(sldId)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("deck")
    ap.add_argument("--master", required=True)
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--assets", default=".", help="root for relative image paths")
    args = ap.parse_args()

    deck = json.loads(Path(args.deck).read_text(encoding="utf-8"))
    if deck.get("version") != 2:
        sys.exit("unsupported deck.json version (expected 2)")
    assets = Path(args.assets)
    prs = Presentation(args.master)
    remove_all_slides(prs)

    for number, s in enumerate(deck["slides"], start=1):
        layout = find_layout(prs, s.get("masterLayout"), s["kind"])
        slide = prs.slides.add_slide(layout)
        ph = placeholders_by_type(slide)
        titles = ph.get("title", []) + ph.get("center_title", [])
        if titles:
            titles[0].text_frame.text = s["title"]
        bodies = ph.get("body", []) + ph.get("object", []) + ph.get("subtitle", [])
        pics = ph.get("picture", [])

        if s["kind"] == "agenda" and s.get("agenda"):
            lines = [f"{it['number']}. {it['title']}" if it["number"] else it["title"] for it in s["agenda"]["items"]]
            if bodies:
                fill_text(bodies[0], lines)
        elif s["layout"] == "image" and s.get("geometry"):
            place_image_slide(slide, s, bodies, assets)
        elif s["layout"] == "2col" and len(bodies) >= 2:
            c1, c2 = split_columns(s["body"])
            fill_text(bodies[0], c1)
            fill_text(bodies[1], c2)
            apply_font_size(bodies[0], s.get("fontPt")); apply_font_size(bodies[1], s.get("fontPt"))
            check_fit(s["title"], bodies[0], c1, s.get("fontPt")); check_fit(s["title"], bodies[1], c2, s.get("fontPt"))
        else:
            text, tables = split_tables(s["body"])
            if bodies:
                fill_text(bodies[0], text)
                apply_font_size(bodies[0], s.get("fontPt"))
                check_fit(s["title"], bodies[0], text, s.get("fontPt"), s.get("fit"))
                for rows in tables:
                    add_table(slide, bodies[0], rows, keep_text=bool([t for t in text if t.strip()]))
            elif s["body"]:
                print(f"warning: no body placeholder on layout '{layout.name}' for '{s['title']}'", file=sys.stderr)

        if s.get("notes"):
            slide.notes_slide.notes_text_frame.text = "\n".join(s["notes"])

        if s["layout"] != "image":
            for i, img in enumerate(s.get("images", [])):
                if i < len(pics):
                    fill_picture(pics[i], img["src"], assets)
                else:
                    print(f"warning: image on a non-image layout ignored: {img['src']} ('{s['title']}')", file=sys.stderr)

        add_footer_placeholders(slide, layout, number, (deck.get("meta") or {}).get("date"))

        # Remove untouched placeholders so PowerPoint does not show "Click to add text".
        for shape in list(slide.placeholders):
            if shape.has_text_frame and not shape.text_frame.text.strip() and shape.placeholder_format.type not in (18,):
                shape._element.getparent().remove(shape._element)

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    prs.save(args.output)
    print(f"wrote {args.output} ({len(deck['slides'])} slides)")


if __name__ == "__main__":
    main()
