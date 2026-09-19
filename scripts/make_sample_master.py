#!/usr/bin/env python3
"""Build the two example masters from one grid: examples/sample-master.pptx and examples/report-master.pptx.

Both start from python-pptx's default template (the Office theme) and are 16:9 with the five convention layouts.
They differ in density, not in structure (ADR-0031, ADR-0032):

  sample-master.pptx  発表用 - read from a distance: 18pt body, 32pt titles, room around the text.
  report-master.pptx  報告用 - read at a desk: 11pt body, a title band that holds a one-sentence conclusion,
                      a tighter gap between title and body so they read as one block, and a palette cut down to
                      base / main / one accent so figures and tables cannot turn into a rainbow.

The placeholders sit on one grid instead of PowerPoint's own defaults: a single margin shared by every layout, a
title band anchored to its baseline, a body that runs down to the footer row, two columns with a real gutter, and
the cover and section text on the golden line.
  Cover      Title Slide: title and subtitle, left aligned on the shared margin
  Agenda     Title Only plus the content box of Title and Content (one body box)
  Section    Section Header: the title and a line of text under it
  Body-Text  Title and Content: title and body follow the slide master
  Body-2col  Two Content: two equal columns
Blank stays as an unused layout (the settings sheet lists it under 未使用); the other Office layouts are removed.
The app bundles both (src/master/sampleMaster.ts) and scripts/make_decorated_master.py decorates the 発表用 one.

Body-Text keeps its boxes inherited from the slide master (no xfrm of its own), which is both how a master is meant
to be built and what tests/unit/importMaster.test.ts reads.

    python3 scripts/make_sample_master.py
"""
import sys
from copy import deepcopy
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.enum.text import MSO_ANCHOR
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml import parse_xml
from pptx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from master_profiles import HANG_EM, PRESENTATION, REPORT, REF_H, REF_W, Profile  # noqa: E402

W, H = REF_W, REF_H
PHI = 1.618033988749895
FOOTER_Y, FOOTER_H = 6356350, 365125  # the footer row stays where PowerPoint puts it (the decorated sample builds on it)
GOLDEN_Y = round(H * (1 - 1 / PHI))   # the upper golden line: where the eye lands first
SECTION_Y = round(H * 0.30)           # higher than the cover: a chapter page must not read like the title page
ROLES = {"Title Slide": "Cover", "Title Only": "Agenda", "Section Header": "Section", "Title and Content": "Body-Text", "Two Content": "Body-2col"}
FONT_LATIN, FONT_JA = "Helvetica Neue", "Hiragino Sans"


def boxes(p: Profile):
    """Every rectangle of one profile, in EMU."""
    margin = round(p.margin * W)
    gap = round(p.title_gap * W)
    gutter = round(p.gutter * W)
    lead = round(p.lead * W)
    content_w = W - 2 * margin
    body_y = margin + p.title_h + gap
    body_h = FOOTER_Y - gap - body_y
    column_w = (content_w - gutter) // 2
    return {
        "master": {
            PP_PLACEHOLDER.TITLE: (margin, margin, content_w, p.title_h),
            PP_PLACEHOLDER.BODY: (margin, body_y, content_w, body_h),
            PP_PLACEHOLDER.DATE: (margin, FOOTER_Y, 2743200, FOOTER_H),
            PP_PLACEHOLDER.FOOTER: ((W - 4114800) // 2, FOOTER_Y, 4114800, FOOTER_H),
            PP_PLACEHOLDER.SLIDE_NUMBER: (W - margin - 2743200, FOOTER_Y, 2743200, FOOTER_H),
        },
        # The cover and the section keep the body's measure: a narrower column would break a Japanese title mid-word.
        "cover": {
            PP_PLACEHOLDER.CENTER_TITLE: (margin, GOLDEN_Y, content_w, p.cover_h),
            PP_PLACEHOLDER.SUBTITLE: (margin, GOLDEN_Y + p.cover_h + lead, content_w, 900000),
        },
        "section": {
            PP_PLACEHOLDER.TITLE: (margin, SECTION_Y, content_w, p.section_h),
            PP_PLACEHOLDER.BODY: (margin, SECTION_Y + p.section_h + lead, content_w, 800000),
        },
        "columns": {1: (margin, body_y, column_w, body_h), 2: (margin + column_w + gutter, body_y, column_w, body_h)},
    }


def place(ph, rect):
    ph.left, ph.top, ph.width, ph.height = rect


def follow_master(sp):
    """Drop a layout shape's own position so it follows the slide master."""
    sp_pr = sp.find(qn("p:spPr"))
    xfrm = sp_pr.find(qn("a:xfrm"))
    if xfrm is not None:
        sp_pr.remove(xfrm)


def set_style_sizes(master, style_tag, sizes, hang=False):
    """Default text sizes of the master's title / body style: what the preview and the exporter read as the default.

    With `hang`, the bullet indent scales with the size too. Office hangs every bullet at 0.375in, which was set for
    32pt text: at 11pt it leaves a gap two and a half characters wide between the bullet and its line."""
    style = master.element.find(qn("p:txStyles")).find(qn(f"p:{style_tag}"))
    for level, size in enumerate(sizes, start=1):
        lvl = style.find(qn(f"a:lvl{level}pPr"))
        if lvl is None:
            continue
        if hang:
            step = round(size * HANG_EM * 12700)   # the bullet and its text read as one line
            lvl.set("marL", str(step * level))
            lvl.set("indent", str(-step))
        rpr = lvl.find(qn("a:defRPr"))
        if rpr is None:
            rpr = etree.SubElement(lvl, qn("a:defRPr"))
        rpr.set("sz", str(round(size * 100)))


def set_lvl1(ph, size_pt=None, align=None):
    """One placeholder's own first-level size and alignment. The cover needs a larger title than the shared style,
    and Office centres the subtitle, which would leave it off the left axis every other layout sits on."""
    body = ph._element.txBody
    lst = body.find(qn("a:lstStyle"))
    if lst is None:
        lst = etree.SubElement(body, qn("a:lstStyle"))
    lvl = lst.find(qn("a:lvl1pPr"))
    if lvl is None:
        lvl = etree.SubElement(lst, qn("a:lvl1pPr"))
    if align:
        lvl.set("algn", align)
    if size_pt:
        rpr = lvl.find(qn("a:defRPr"))
        if rpr is None:
            rpr = etree.SubElement(lvl, qn("a:defRPr"))
        rpr.set("sz", str(round(size_pt * 100)))


def theme_root(master):
    part = master.part.part_related_by(RT.THEME)
    root = getattr(part, "_element", None)
    return part, (root if root is not None else parse_xml(part.blob)), root is None


def set_theme(master, latin, japanese, colors):
    """The theme's fonts and, for the report master, a palette of base / main / one accent (plus greys of it).

    Calibri is not on a stock Mac, so the sample would fall back to something arbitrary. The colours also reach
    theme.json, which the figure tool uses, so a cut-down palette keeps generated figures in the same three colours."""
    part, xml, detached = theme_root(master)
    for scheme in ("majorFont", "minorFont"):
        node = xml.find(f'.//{qn("a:" + scheme)}')
        node.find(qn("a:latin")).set("typeface", latin)
        jp = node.find(f'{qn("a:font")}[@script="Jpan"]')
        if jp is None:
            jp = etree.SubElement(node, qn("a:font"))
            jp.set("script", "Jpan")
        jp.set("typeface", japanese)
    if colors:
        scheme = xml.find(f'.//{qn("a:clrScheme")}')
        for key, rgb in colors.items():
            slot = scheme.find(qn(f"a:{key}"))
            if slot is None:
                continue
            for child in list(slot):
                slot.remove(child)
            slot.append(parse_xml(f'<a:srgbClr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" val="{rgb}"/>'))
    if detached:
        part._blob = etree.tostring(xml, xml_declaration=True, encoding="UTF-8", standalone=True)


def build(p: Profile):
    rects = boxes(p)
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    master = prs.slide_master
    for ph in master.placeholders:
        place(ph, rects["master"][ph.placeholder_format.type])
        if ph.placeholder_format.type == PP_PLACEHOLDER.TITLE:
            ph.text_frame.vertical_anchor = MSO_ANCHOR.BOTTOM  # a one-line and a two-line title share a baseline
    set_style_sizes(master, "titleStyle", (p.title_pt,))
    set_style_sizes(master, "bodyStyle", p.body_pts, hang=True)
    set_theme(master, FONT_LATIN, FONT_JA, p.colors)

    layouts = {layout.name: layout for layout in prs.slide_layouts}
    content_box = next(ph for ph in layouts["Title and Content"].placeholders if ph.placeholder_format.idx == 1)
    for name, layout in layouts.items():
        if name not in ROLES and name != "Blank":
            prs.slide_layouts.remove(layout)
            continue
        for ph in layout.placeholders:
            t, idx = ph.placeholder_format.type, ph.placeholder_format.idx
            if name == "Title Slide" and t in rects["cover"]:
                place(ph, rects["cover"][t])
                set_lvl1(ph, p.cover_pt if t == PP_PLACEHOLDER.CENTER_TITLE else p.subtitle_pt, align="l")
            elif name == "Section Header" and t in rects["section"]:
                place(ph, rects["section"][t])
                set_lvl1(ph, p.section_pt if t == PP_PLACEHOLDER.TITLE else p.body_pts[0], align="l")
            elif name == "Two Content" and idx in rects["columns"]:
                place(ph, rects["columns"][idx])
            else:
                follow_master(ph._element)  # titles, bodies, date / footer / slide number
        if name == "Title Only":  # Agenda: the title plus one content box
            box = deepcopy(content_box._element)
            follow_master(box)
            ids = [int(e.get("id")) for e in layout.shapes._spTree.iter(qn("p:cNvPr"))]
            box.find(qn("p:nvSpPr")).find(qn("p:cNvPr")).set("id", str(max(ids) + 1))
            title = next(ph for ph in layout.placeholders if ph.placeholder_format.type == PP_PLACEHOLDER.TITLE)
            title._element.addnext(box)
        layout.name = ROLES.get(name, name)

    out = ROOT / "examples" / p.out
    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(out))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, 本文 {p.body_pts[0]}pt)")


def main():
    for profile in (PRESENTATION, REPORT):
        build(profile)


if __name__ == "__main__":
    main()
