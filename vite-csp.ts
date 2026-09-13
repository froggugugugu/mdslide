import type { Plugin } from "vite";

/**
 * Content-Security-Policy of the built page, for the Electron renderer and the browser build alike (ADR-0026).
 * Scripts come only from the app's own files. Images: the app, blob: (files read from the deck folder) and data:.
 * connect-src data: is the bundled sample master (src/master/sampleMaster.ts fetches its data: URL).
 * Styles stay inline-capable: React style props, CodeMirror and xterm.js set them.
 * Build only: the dev server injects inline scripts for hot reload.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function contentSecurityPolicy(): Plugin {
  return {
    name: "mdslide-csp",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head-prepend" }],
  };
}
