import { defineConfig } from "vitest/config";

const config: ReturnType<typeof defineConfig> = defineConfig({
  resolve: {
    alias: {
      "@open-charging-cloud/chargy-core": new URL("./src/index.ts", import.meta.url).pathname,
      "#pdfjs-runtime": new URL("./src/pdfjs/node.ts", import.meta.url).pathname
    }
  },
  test: {
    name: "node",
    environment: "node",
    globals: false,
    // Deliberately not Europe/Berlin: the fixtures are signed with German local
    // time, so running the suite anywhere else is what exposes code that reads
    // the offset from the host instead of from the record.
    env: {
      TZ: "UTC"
    },
    // The QR code and PDF/A-3 cases lazily import pdfjs and the native canvas
    // binding inside the test body, and that first import is charged to the
    // test. It costs about 0.2s here and on Linux CI, but the Windows runner
    // needs well over the 5s default: one run spent 10.9s on imports alone
    // against 2s for the whole suite on Linux. Raised far enough to absorb
    // that, while still failing a test that genuinely hangs.
    testTimeout: 30_000,
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.tests.ts"
    ],
    exclude: [
      "tests/browser/**",
      "tests/build/**"
    ],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/declarations.d.ts",
        "src/index.ts"
      ]
    }
  }
});

export default config;
