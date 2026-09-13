#!/usr/bin/env python3
"""Build examples/sample-master.pptx, the master that shows the layout naming convention.

It starts from python-pptx's default template (the Office theme), makes the slide 16:9 and puts the placeholders at
PowerPoint's own 16:9 positions. One layout per role, each with exactly the boxes mdslide fills:
  Cover      Title Slide: centered title and subtitle
  Agenda     Title Only plus the content box of Title and Content (one body box)
  Section    Section Header: the title and a line of text under it
  Body-Text  Title and Content: title and body follow the slide master
  Body-2col  Two Content: two equal columns
Blank stays as an unused layout (the settings sheet lists it under 未使用); the other Office layouts are removed.
The app bundles the result (src/master/sampleMaster.ts) and scripts/make_decorated_master.py decorates it.

    python3 scripts/make_sample_master.py
"""
from copy import deepcopy
from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "examples" / "sample-master.pptx"
W, H = 12192000, 6858000

# PowerPoint's 16:9 positions: left, top, width, height in EMU.
MASTER = {
    PP_PLACEHOLDER.TITLE: (838200, 365125, 10515600, 1325563),
    PP_PLACEHOLDER.BODY: (838200, 1825625, 10515600, 4351338),
    PP_PLACEHOLDER.DATE: (838200, 6356350, 2743200, 365125),
    PP_PLACEHOLDER.FOOTER: (4038600, 6356350, 4114800, 365125),
    PP_PLACEHOLDER.SLIDE_NUMBER: (8610600, 6356350, 2743200, 365125),
}
COVER = {PP_PLACEHOLDER.CENTER_TITLE: (1524000, 1122363, 9144000, 2387600), PP_PLACEHOLDER.SUBTITLE: (1524000, 3602038, 9144000, 1655762)}
SECTION = {PP_PLACEHOLDER.TITLE: (831850, 1709738, 10515600, 2852737), PP_PLACEHOLDER.BODY: (831850, 4589463, 10515600, 1500187)}
COLUMNS = {1: (838200, 1825625, 5181600, 4351338), 2: (6172200, 1825625, 5181600, 4351338)}
ROLES = {"Title Slide": "Cover", "Title Only": "Agenda", "Section Header": "Section", "Title and Content": "Body-Text", "Two Content": "Body-2col"}


def place(ph, rect):
    ph.left, ph.top, ph.width, ph.height = rect


def follow_master(sp):
    """Drop a layout shape's own position so it follows the slide master."""
    sp_pr = sp.find(qn("p:spPr"))
    xfrm = sp_pr.find(qn("a:xfrm"))
    if xfrm is not None:
        sp_pr.remove(xfrm)


def main():
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    for ph in prs.slide_master.placeholders:
        place(ph, MASTER[ph.placeholder_format.type])

    layouts = {layout.name: layout for layout in prs.slide_layouts}
    content_box = next(ph for ph in layouts["Title and Content"].placeholders if ph.placeholder_format.idx == 1)
    for name, layout in layouts.items():
        if name not in ROLES and name != "Blank":
            prs.slide_layouts.remove(layout)
            continue
        for ph in layout.placeholders:
            t, idx = ph.placeholder_format.type, ph.placeholder_format.idx
            if name == "Title Slide" and t in COVER:
                place(ph, COVER[t])
            elif name == "Section Header" and t in SECTION:
                place(ph, SECTION[t])
            elif name == "Two Content" and idx in COLUMNS:
                place(ph, COLUMNS[idx])
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

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
