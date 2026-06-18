import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  dts: false,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  outDir: "dist",
  noExternal: [
    "elliptic"
  ],
  external: [
    "asn1.js",
    "base32-decode",
    "buffer",
    "decimal.js",
    "file-type",
    "jsqr",
    "moment",
    "pdfjs-dist",
    "seek-bzip"
  ]
});
