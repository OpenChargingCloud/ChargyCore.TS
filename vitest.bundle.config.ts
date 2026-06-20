import { defineConfig } from "vitest/config";

const config: ReturnType<typeof defineConfig> = defineConfig({
  test: {
    name: "bundle",
    environment: "node",
    globals: false,
    include: [
      "tests/build/**/*.test.js"
    ]
  }
});

export default config;
