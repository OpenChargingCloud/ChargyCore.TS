import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "bundle",
    environment: "node",
    globals: false,
    include: [
      "tests/build/**/*.test.js"
    ]
  }
});
