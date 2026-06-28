import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

const config: ReturnType<typeof defineConfig> = defineConfig({
  resolve: {
    alias: {
      "@open-charging-cloud/chargy-core": new URL("./src/index.ts", import.meta.url).pathname,
      "#pdfjs-runtime": new URL("./src/pdfjs/browser.ts", import.meta.url).pathname,
      "buffer": new URL("./node_modules/buffer/index.js", import.meta.url).pathname
    }
  },
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
