// Lecture du texte positionné d'un PDF (pdf.js), avec repli OCR (tesseract.js) pour les PDF scannés.
import * as pdfjs from "pdfjs-dist";
import PdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { groupLines, type Item, type PageText } from "./lines";

export type { Item, PageText };

// Un seul worker, démarré dès le chargement du module et réutilisé pour tous les documents :
// une longue extraction ne dépend plus du serveur pour recharger le worker à chaque PDF.
let workerPort: Worker | null = null;
function ensureWorker() {
  if (!workerPort) {
    workerPort = new PdfjsWorker();
    pdfjs.GlobalWorkerOptions.workerPort = workerPort;
  }
}
ensureWorker();

export function loadPdf(data: ArrayBuffer) {
  ensureWorker();
  return pdfjs.getDocument({ data: new Uint8Array(data) });
}

export async function readPages(
  data: ArrayBuffer,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<{ pages: PageText[]; scanned: boolean }> {
  const task = loadPdf(data.slice(0));
  const doc = await task.promise;
  const pages: PageText[] = [];
  let chars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, , , d, e, f] = it.transform as number[];
      const h = Math.abs(d) || Math.abs(a) || 8;
      items.push({ str: it.str, x: e, x2: e + it.width, y: vp.height - f, h });
    }
    chars += items.reduce((s, i) => s + i.str.length, 0);
    pages.push({ page: p, items, text: linesToText(items) });
    onProgress?.(p, doc.numPages, "Lecture du texte");
  }
  // PDF scanné : quasiment pas de texte → reconnaissance de texte, et le SFCR entier part en revue
  const scanned = doc.numPages > 0 && chars / doc.numPages < 80;
  if (scanned) {
    const ocr = await ocrPages(doc, onProgress);
    await task.destroy();
    return { pages: ocr, scanned: true };
  }
  await task.destroy();
  return { pages, scanned: false };
}

async function ocrPages(doc: pdfjs.PDFDocumentProxy, onProgress?: (done: number, total: number, label: string) => void): Promise<PageText[]> {
  const { createWorker } = await import("tesseract.js");
  // Moteur servi par l'application elle-même (public/tesseract), jamais par un CDN : seules les données
  // de langue (fichiers .traineddata, sans code) viennent encore de cdn.jsdelivr.net
  const local = (p: string) => new URL(p, window.location.origin).href;
  const worker = await createWorker(["eng", "fra", "deu"], undefined, {
    workerPath: local("/tesseract/worker.min.js"),
    corePath: local("/tesseract/"),
    workerBlobURL: false,
  });
  const out: PageText[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const scale = 2;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const items: Item[] = [];
      for (const b of data.blocks ?? []) for (const para of b.paragraphs) for (const line of para.lines) for (const w of line.words) {
        items.push({ str: w.text, x: w.bbox.x0 / scale, x2: w.bbox.x1 / scale, y: w.bbox.y1 / scale, h: (w.bbox.y1 - w.bbox.y0) / scale });
      }
      out.push({ page: p, items, text: linesToText(items) });
      onProgress?.(p, doc.numPages, "Reconnaissance de texte (PDF scanné)");
    }
  } finally {
    await worker.terminate();
  }
  return out;
}

function linesToText(items: Item[]) {
  return groupLines(items).map((l) => l.map((i) => i.str).join(" ")).join("\n");
}
