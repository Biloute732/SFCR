// Export Excel (US12) : valeurs normalisées, unité, entité, année, QRT, cellule, page et URL source.
import * as XLSX from "xlsx";
import { LEGAL_NOTICE, ORIGIN_LABEL } from "./format";
import { countryName } from "./countries";
import type { Indicator, Resolved } from "./indicators";
import type { Entity } from "./types";

export interface ExportItem {
  entity: Entity;
  year: number;
  ind: Indicator;
  r: Resolved;
}

const unitOf = (ind: Indicator, displayUnit: string) => (ind.unit === "pct" ? "%" : displayUnit);
const scale = (v: number | null, ind: Indicator, displayUnit: string) =>
  v == null ? null : ind.unit === "keur" && displayUnit === "MEUR" ? v / 1000 : v;

export function exportWorkbook(opts: {
  fileName: string;
  title: string;
  displayUnit: "kEUR" | "MEUR";
  /** Feuille de synthèse : lignes = indicateurs, colonnes libres. */
  summary: { header: string[]; rows: (string | number | null)[][] };
  items: ExportItem[];
}) {
  const wb = XLSX.utils.book_new();

  const head = [[opts.title], [`Unité des montants : ${opts.displayUnit} ; ratios en %`], [LEGAL_NOTICE], []];
  const ws1 = XLSX.utils.aoa_to_sheet([...head, opts.summary.header, ...opts.summary.rows]);
  ws1["!cols"] = opts.summary.header.map((_, i) => ({ wch: i === 0 ? 38 : 18 }));
  XLSX.utils.book_append_sheet(wb, ws1, "Synthèse");

  const rows: (string | number | null)[][] = [[
    "Entité", "LEI", "Pays", "Niveau", "Type", "Année", "Indicateur", "Valeur", "Unité", "Type d'indicateur", "Formule",
    "QRT", "Cellule(s)", "Page(s)", "URL source", "Origine", "Date de collecte", "Valeur brute", "Facteur appliqué",
  ]];
  for (const it of opts.items) {
    const cells = it.r.sources.filter((s) => s.cell);
    const c0 = cells[0]?.cell;
    rows.push([
      it.entity.name, it.entity.lei.startsWith("NOLEI:") ? "" : it.entity.lei, countryName(it.entity.country), it.entity.level, it.entity.type, it.year,
      it.ind.label, scale(it.r.value, it.ind, opts.displayUnit), unitOf(it.ind, opts.displayUnit), it.ind.kind, it.r.formula,
      [...new Set(it.r.sources.map((s) => s.ref.qrt))].join(" ; "),
      it.r.sources.map((s) => `${s.ref.row} ${s.ref.col}`).join(" ; "),
      [...new Set(cells.flatMap((s) => s.cell!.pages ?? []))].join(" ; "),
      c0?.source_url ?? "", c0 ? ORIGIN_LABEL[c0.origin] ?? c0.origin : "", c0?.collected_at?.slice(0, 10) ?? "",
      cells.map((s) => s.cell!.raw_text ?? "").join(" ; "), cells.map((s) => s.cell!.factor ?? "").join(" ; "),
    ]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(rows);
  ws2["!cols"] = rows[0].map((h) => ({ wch: Math.max(12, String(h).length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws2, "Données sources");

  const ws3 = XLSX.utils.aoa_to_sheet([
    ["Mention légale"], [LEGAL_NOTICE], [],
    ["Seules les valeurs dont l'unité et la devise ont été validées figurent dans cet export."],
    ["Un indicateur calculé n'est renseigné que si toutes ses cellules sources sont validées."],
    ["Une valeur absente reste absente : aucune donnée n'est inventée ni interpolée."],
    [`Export du ${new Date().toLocaleString("fr-FR")}`],
  ]);
  XLSX.utils.book_append_sheet(wb, ws3, "Mention légale");
  XLSX.writeFile(wb, opts.fileName);
}
