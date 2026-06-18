import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

function readDistFile(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("conditional build artifacts", () => {

  test("browser build contains only the browser PDF.js import path", () => {
    const browserBundle = readDistFile("dist/browser/index.js");

    expect(browserBundle).toContain("pdfjs-dist");
    expect(browserBundle).toContain("pdfjs-dist/build/pdf.worker.mjs");
    expect(browserBundle).not.toContain("pdfjs-dist/legacy/build/pdf.mjs");
    expect(browserBundle).not.toContain("pdfjs-dist/legacy/build/pdf.worker.mjs");
  });

  test("node build contains only the legacy PDF.js import path", () => {
    const nodeBundle = readDistFile("dist/node/index.js");

    expect(nodeBundle).toContain("pdfjs-dist/legacy/build/pdf.mjs");
    expect(nodeBundle).toContain("pdfjs-dist/legacy/build/pdf.worker.mjs");
    expect(nodeBundle).not.toContain("pdfjs-dist/build/pdf.worker.mjs");
  });

});
