import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

const config: ReturnType<typeof defineConfig> = defineConfig({
  test: {
    name: "browser",
    globals: false,
    include: [
      "tests/browser/**/*.test.js"
    ],
    browser: {
      enabled: true,
      provider: playwright({}),
      instances: [
        {
          browser: "chromium"
        }
      ],
      headless: true
    }
  }
});

export default config;
