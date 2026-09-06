import type { SlideKind } from "../model/types";

/** Fractions of slide width/height. Used for preview when the master has no geometry for a role. */
export interface Region { x: number; y: number; w: number; h: number }
export interface PresetLayout { title: Region; body?: Region; body2?: Region; image?: Region }

const TITLE: Region = { x: 0.05, y: 0.06, w: 0.9, h: 0.12 };
const FULL: Region = { x: 0.05, y: 0.22, w: 0.9, h: 0.7 };

export const BODY_PRESETS: Record<"text" | "2col", PresetLayout> = {
  "text": { title: TITLE, body: FULL },
  "2col": { title: TITLE, body: { x: 0.05, y: 0.22, w: 0.43, h: 0.7 }, body2: { x: 0.52, y: 0.22, w: 0.43, h: 0.7 } },
};

export const KIND_PRESETS: Record<Exclude<SlideKind, "body">, PresetLayout> = {
  cover: { title: { x: 0.08, y: 0.32, w: 0.84, h: 0.2 }, body: { x: 0.08, y: 0.56, w: 0.84, h: 0.25 } },
  agenda: { title: TITLE, body: { x: 0.1, y: 0.24, w: 0.8, h: 0.68 } },
  section: { title: { x: 0.08, y: 0.38, w: 0.84, h: 0.2 }, body: { x: 0.08, y: 0.6, w: 0.84, h: 0.2 } },
};

