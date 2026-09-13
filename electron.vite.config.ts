import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { contentSecurityPolicy } from "./vite-csp";

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: resolve(__dirname, "electron/main.ts") } } },
  // CommonJS: a sandboxed renderer cannot load an ES module preload (ADR-0026). The package is "type": "module", hence .cjs.
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve(__dirname, "electron/preload.ts") }, rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss(), contentSecurityPolicy()],
    assetsInclude: ["**/*.pptx"], // the bundled sample master (src/master/sampleMaster.ts imports it ?inline)
    build: { rollupOptions: { input: resolve(__dirname, "index.html") } },
  },
});
