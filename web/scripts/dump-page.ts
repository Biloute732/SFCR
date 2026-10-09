import { readFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const [path, ...pg] = process.argv.slice(2);
const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(path)), isEvalSupported: false }).promise;
for (const p of pg.map(Number)) {
  const page = await doc.getPage(p); const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  console.log("=== page", p);
  for (const it of tc.items as any[]) if (it.str?.trim()) console.log(Math.round(it.transform[4]), Math.round(vp.height - it.transform[5]), Math.round(it.width), JSON.stringify(it.str));
}
