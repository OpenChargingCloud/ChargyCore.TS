import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: false,
    include: [
      "tests/browser/**/*.test.js"
    ],
    browser: {
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
