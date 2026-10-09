// Banc d'essai du moteur d'extraction sur des SFCR réels (PRD V2, section 7 « Approche technique »).
// Usage : npx tsx scripts/bench-extract.ts <fichier.pdf> [...]
// Affiche, par PDF : année, unité, QRT repérés, cellules lues et valeurs des indicateurs clés.
import { readFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractQrts } from "../src/lib/extract/extractor";
import type { Item, PageText } from "../src/lib/extract/lines";
import { groupLines } from "../src/lib/extract/lines";
import { runControls } from "../src/lib/extract/controls";

async function read(path: string): Promise<PageText[]> {
  const data = new Uint8Array(await readFile(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, , , d, e, f] = it.transform as number[];
      items.push({ str: it.str, x: e, x2: e + it.width, y: vp.height - f, h: Math.abs(d) || Math.abs(a) || 8 });
    }
    pages.push({ page: p, items, text: groupLines(items).map((l) => l.map((i) => i.str).join(" ")).join("\n") });
  }
  return pages;
}

const KEY = [
  "S.02.01|R0500|C0010", "S.02.01|R0900|C0010", "S.02.01|R1000|C0010", "S.02.01|R0510|C0010", "S.02.01|R0600|C0010", "S.02.01|R0690|C0010",
  "S.23.01|R0540|C0010", "S.23.01|R0580|C0010", "S.23.01|R0600|C0010", "S.23.01|R0620|C0010", "S.23.01|R0640|C0010",
  "S.25.01|R0200|C0100", "S.25.01|R0220|C0100", "S.25.01|R0220|C0110", "S.28.01|R0400|C0070", "S.28.02|R0400|C0130",
  "S.05.01|R0110|C0200", "S.05.01|R0200|C0200", "S.05.01|R0300|C0200", "S.05.01|R0400|C0200", "S.05.01|R0550|C0200",
  "S.05.01|R1410|C0300", "S.05.01|R1500|C0300", "S.12.01|R0200|C0150", "S.12.01|R0200|C0210", "S.17.01|R0320|C0180",
];

for (const path of process.argv.slice(2)) {
  const t0 = Date.now();
  let pages: PageText[];
  try { pages = await read(path); } catch (e) { console.log(`
══ ${path} : illisible (${(e as Error).message})`); continue; }
  const level = /gr(ou)?p/i.test(path) ? "Groupe" : "Solo";
  const r = extractQrts(pages, level);
  console.log(`\n══ ${path}  (${pages.length} p., ${Date.now() - t0} ms, ${level})`);
  console.log(`Année : ${r.year?.year ?? "?"}  « ${r.year?.evidence ?? ""} » p.${r.year?.page ?? "-"}`);
  console.log(`Unité : ${r.unit.label} ×${r.unit.factor} ${r.unit.currency} ${r.unit.explicit ? "explicite" : "par défaut"}  « ${r.unit.evidence ?? ""} » p.${r.unit.page ?? "-"}`);
  console.log(`QRT : ${r.qrts.map((q) => `${q.fullCode}${q.matchedBy === "label" ? "(libellé)" : ""}[${q.pages.join(",")}]`).join("  ")}`);
  console.log(`Cellules : ${r.cells.length} (dont ${r.cells.filter((c) => !c.isBlank).length} renseignées) · LEI : ${r.leis.slice(0, 3).join(", ")} · filiales : ${r.groupMembers.length}`);
  const m = new Map(r.cells.map((c) => [`${c.family}|${c.row}|${c.col}`, c]));
  for (const k of KEY) {
    const c = m.get(k);
    if (c) console.log(`  ${k.padEnd(22)} ${String(c.rawValue ?? "—").padStart(16)}   « ${c.rawText} » p.${c.pages.join(",")}`);
  }
  const ctl = runControls(r.cells.map((c) => ({ ...c, value: c.isRatio ? c.rawValue : c.rawValue == null ? null : c.rawValue * r.unit.factor })), { level, caaRatio: null, previous: null });
  for (const c of ctl) console.log(`  [${c.status}] ${c.label} ${c.message ?? ""}`);
  for (const l of r.log) console.log("  · " + l);
}
