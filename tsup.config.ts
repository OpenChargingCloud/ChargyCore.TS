import { resolve } from "node:path";

type BuildOptions = {
  alias?: Record<string, string>;
};

type TsupConfig = {
  entry: string[];
  format: string[];
  target: string;
  platform: "browser" | "node";
  dts: boolean;
  sourcemap: boolean;
  clean: boolean;
  splitting: boolean;
  treeshake: boolean;
  outDir: string;
  noExternal: string[];
  external: string[];
  esbuildOptions(buildOptions: BuildOptions): void;
};

type TsupConfigExport = () => TsupConfig[];

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

const config: TsupConfigExport = () => [{
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
  esbuildOptions(buildOptions): void {
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
  esbuildOptions(buildOptions): void {
    buildOptions.alias = {
      ...buildOptions.alias,
      "#pdfjs-runtime": resolve("src/pdfjs/node.ts")
    };
  }
}];

export default config;
