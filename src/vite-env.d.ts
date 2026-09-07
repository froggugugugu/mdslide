/// <reference types="vite/client" />
declare module "*.py?raw" { const src: string; export default src; }
declare module "*.pptx?inline" { const dataUrl: string; export default dataUrl; }
