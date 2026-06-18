import type { PdfJsLib } from "./browser";

export async function importPdfJs(): Promise<PdfJsLib> {

    const pdfjsLib     = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfWorkerSrc = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

    if (typeof pdfWorkerSrc.default === "string")
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc.default;

    return pdfjsLib;

}
