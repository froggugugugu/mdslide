#!/usr/bin/env python3
"""The grid and the type scale of the bundled example masters (ADR-0031, ADR-0032).

Two readers share these numbers:
  scripts/make_sample_master.py  builds examples/sample-master.pptx and examples/report-master.pptx from them.
  tools/convert_master.py        imposes the same measures on the body pages of a converted template.

It lives under tools/ on purpose: only tools/ ships with the packaged app (electron-builder.yml extraResources), so
a converter importing this from scripts/ would work in the checkout and fail once installed.

The split the converter follows: a template's own design — theme, fonts, colours, background, logo, header, footer,
cover and section — is left alone, while the body pages take their measure and their type from here. That is what
makes "one page holds N lines" a property of mdslide rather than of whichever template someone happened to bring.
"""
from dataclasses import dataclass, field

REF_W, REF_H = 12192000, 6858000   # the 16:9 slide the sample masters are built on
EMU_PER_PT = 12700
HANG_EM = 1.6                      # bullet indent as a multiple of the type size: the bullet and its line read as one
INSET_LR, INSET_TB = 91440, 45720  # Office's default text insets, which the sample masters keep


@dataclass
class Profile:
    """One master: the grid (fractions of the slide WIDTH, so margins are optically equal on all sides) and the type."""
    name: str
    out: str
    margin: float
    title_gap: float
    gutter: float
    title_h: int                      # EMU on the reference slide
    lead: float                       # title to the line under it, on the cover and the section
    title_pt: int
    cover_pt: int
    section_pt: int
    subtitle_pt: int
    body_pts: tuple
    cover_h: int
    section_h: int
    colors: dict = field(default_factory=dict)   # empty: keep the Office theme (tests/unit/theme.test.ts fixes it)

    @property
    def title_band(self) -> float:
        """The title band as a fraction of the slide HEIGHT, so it carries to a slide of another size."""
        return self.title_h / REF_H


PRESENTATION = Profile(
    name="presentation", out="sample-master.pptx", margin=0.06, title_gap=0.02, gutter=0.04, title_h=1005840, lead=0.015,
    title_pt=32, cover_pt=40, section_pt=36, subtitle_pt=18, body_pts=(18, 16, 14, 12, 12),
    cover_h=1600200, section_h=1200000,
)
# Read at a desk: more lines per page, the title and the body close enough to read as one block, and three colours.
REPORT = Profile(
    name="report", out="report-master.pptx", margin=0.05, title_gap=0.012, gutter=0.03, title_h=640080, lead=0.012,
    title_pt=20, cover_pt=28, section_pt=20, subtitle_pt=12, body_pts=(11, 10, 9, 9, 9),
    cover_h=1000000, section_h=800000,
    colors={"dk1": "1A1A1A", "lt1": "FFFFFF", "dk2": "1A1A1A", "lt2": "F2F4F7", "accent1": "0B5FA5",
            "accent2": "4A7FB5", "accent3": "7FA3C4", "accent4": "6B7280", "accent5": "9CA3AF", "accent6": "D1D5DB"},
)

PROFILES = {p.name: p for p in (PRESENTATION, REPORT)}
DEFAULT_PROFILE = "report"   # mdslide is a tool for reports; the denser page is the better default
