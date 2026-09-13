import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { contentSecurityPolicy } from "./vite-csp";

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  assetsInclude: ["**/*.pptx"], // the bundled sample master (src/master/sampleMaster.ts imports it ?inline)
});
