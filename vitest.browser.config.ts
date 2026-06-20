import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
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
