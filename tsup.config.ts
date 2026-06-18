import { defineConfig } from "tsup";
import { resolve } from "node:path";

const external = [
  "asn1.js",
  "base32-decode",
  "decimal.js",
  "file-type",
  "jsqr",
  "moment",
  "pdfjs-dist",
  "pdfjs-dist/build/pdf.worker.mjs",
  "pdfjs-dist/legacy/build/pdf.mjs",
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  "seek-bzip"
];

const browserExternal = external;

const nodeExternal = [
  ...external,
  "buffer"
];

const noExternal = [
  "elliptic"
];

const browserNoExternal = [
  ...noExternal,
  "buffer"
];

export default defineConfig(() => [{
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  dts: false,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  outDir: "dist/browser",
  noExternal: browserNoExternal,
  external: browserExternal,
  esbuildOptions(buildOptions) {
    buildOptions.alias = {
      ...buildOptions.alias,
      "#pdfjs-runtime": resolve("src/pdfjs/browser.ts")
    };
  }
}, {
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "node",
  dts: false,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  outDir: "dist/node",
  noExternal,
  external: nodeExternal,
  esbuildOptions(buildOptions) {
    buildOptions.alias = {
      ...buildOptions.alias,
      "#pdfjs-runtime": resolve("src/pdfjs/node.ts")
    };
  }
}]);
