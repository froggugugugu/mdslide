import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: resolve(__dirname, "electron/main.ts") } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: resolve(__dirname, "electron/preload.ts") } } },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    assetsInclude: ["**/*.pptx"], // the bundled sample master (src/master/sampleMaster.ts imports it ?inline)
    build: { rollupOptions: { input: resolve(__dirname, "index.html") } },
  },
});
