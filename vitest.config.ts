import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.pptx"], // the bundled sample master (src/master/sampleMaster.ts imports it ?inline)
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/sample.ts", "src/**/*.d.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
      reporter: ["text", "html", "lcov"],
    },
  },
});
