import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// jsdom lacks these browser APIs used by the app.
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
// Always stub object URLs: vitest 4 exposes Node's URL, whose createObjectURL returns "blob:nodedata:..." and is not deterministic.
URL.createObjectURL = () => "blob:mock";
URL.revokeObjectURL = () => undefined;

// CodeMirror measures text with Range APIs jsdom does not implement.
const emptyRect = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () { /* empty */ } }) as unknown as DOMRectList;
}
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => emptyRect;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => undefined;
if (!window.matchMedia) {
  window.matchMedia = (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}
