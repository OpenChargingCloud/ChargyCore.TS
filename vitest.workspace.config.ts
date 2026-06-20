import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "./vitest.config.ts",
      "./vitest.bundle.config.ts",
      "./vitest.browser.config.ts"
    ]
  }
});
