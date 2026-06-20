import { defineConfig } from "vitest/config";

const config: ReturnType<typeof defineConfig> = defineConfig({
  test: {
    projects: [
      "./vitest.config.ts",
      "./vitest.bundle.config.ts",
      "./vitest.browser.config.ts"
    ]
  }
});

export default config;
