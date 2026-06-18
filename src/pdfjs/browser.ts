export type PdfJsLib = typeof import("pdfjs-dist");

export async function importPdfJs(): Promise<PdfJsLib> {

    const pdfjsLib     = await import("pdfjs-dist");
    const pdfWorkerSrc = await import("pdfjs-dist/build/pdf.worker.mjs");

    if (typeof pdfWorkerSrc.default === "string")
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc.default;

    return pdfjsLib;

}
