import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@open-charging-cloud/chargy-core": new URL("./src/index.ts", import.meta.url).pathname,
      "#pdfjs-runtime": new URL("./src/pdfjs/node.ts", import.meta.url).pathname
    }
  },
  test: {
    environment: "node",
    globals: false,
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
