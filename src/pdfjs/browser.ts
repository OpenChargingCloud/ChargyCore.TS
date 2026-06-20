import type * as PdfJsDist from "pdfjs-dist";

export type PdfJsLib = typeof PdfJsDist;

export async function importPdfJs(): Promise<PdfJsLib> {

    const pdfjsLib     = await import("pdfjs-dist");
    const pdfWorkerSrc = await import("pdfjs-dist/build/pdf.worker.mjs");

    if (typeof pdfWorkerSrc.default === "string")
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc.default;

    return pdfjsLib;

}
