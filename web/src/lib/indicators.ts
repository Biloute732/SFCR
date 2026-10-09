// Dictionnaire des indicateurs (PRD V2, section 5).
// Chaque indicateur pointe vers des cellules QRT précises. Un indicateur calculé n'est affiché
// que si toutes ses cellules sources sont validées ; une seule manquante, et il reste vide.
import { cellKey, ref, type CellRef } from "./qrt";
import type { Branch, Entity, EntityType, Level, VCell } from "./types";

export type IndicatorBranch = "any" | "Vie" | "Non-Vie" | "activity";

interface Term {
  ref: CellRef;
  /** Terme facultatif d'une somme : une cellule validée « non renseignée » compte pour 0 (affiché comme tel). */
  optional?: boolean;
}

interface Variant {
  terms: Term[];
  formula: string;
  compute: (v: (number | null)[]) => number | null;
}

export interface Indicator {
  id: string;
  label: string;
  short: string;
  unit: "keur" | "pct";
  kind: "Publié" | "Calculé";
  branch: IndicatorBranch;
  definition: string;
  levels: Level[];
  /** Variantes essayées dans l'ordre (ex. S.25.01 puis S.25.05). */
  solo: Variant[];
  group?: Variant[];
}

const one = (r: CellRef, label?: string): Variant => ({
  terms: [{ ref: r }],
  formula: label ?? `${r.qrt} ${r.row} ${r.col}`,
  compute: ([a]) => a,
});
const sum = (terms: Term[], formula: string): Variant => ({
  terms, formula,
  compute: (v) => v.reduce<number>((s, x) => s + (x ?? 0), 0),
});

export const INDICATORS: Indicator[] = [
  {
    id: "scr_ratio", label: "Ratio de solvabilité (SCR)", short: "Ratio SCR", unit: "pct", kind: "Publié", branch: "any",
    definition: "Fonds propres éligibles / SCR", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.23.01", "R0620", "C0010"))],
    group: [one(ref("S.23.01", "R0690", "C0010")), one(ref("S.23.01", "R0630", "C0010"))],
  },
  {
    id: "mcr_ratio", label: "Ratio MCR", short: "Ratio MCR", unit: "pct", kind: "Publié", branch: "any",
    definition: "Fonds propres éligibles / MCR", levels: ["Solo"],
    solo: [one(ref("S.23.01", "R0640", "C0010"))],
  },
  {
    id: "scr", label: "SCR", short: "SCR", unit: "keur", kind: "Publié", branch: "any",
    definition: "Capital de solvabilité requis (S.25.01 ou S.25.05 ; S.25.02 / S.25.03 avant 2023 ; contrôlé avec S.23.01 R0580)", levels: ["Solo", "Groupe"],
    solo: [
      one(ref("S.25.01", "R0220", "C0100")), one(ref("S.25.01", "R0220", "C0110")),
      one(ref("S.25.05", "R0220", "C0100")), one(ref("S.25.05", "R0220", "C0110")),
      // ancien format (jusqu'à 2022) : modèle interne partiel / intégral
      one(ref("S.25.02", "R0220", "C0100")), one(ref("S.25.03", "R0220", "C0100")),
    ],
    group: [
      one(ref("S.25.01", "R0220", "C0100")), one(ref("S.25.01", "R0220", "C0110")),
      one(ref("S.25.05", "R0220", "C0100")), one(ref("S.25.02", "R0220", "C0100")), one(ref("S.23.01", "R0680", "C0010")),
    ],
  },
  {
    id: "mcr", label: "MCR", short: "MCR", unit: "keur", kind: "Publié", branch: "any",
    definition: "Minimum de capital requis (S.28.01 ou S.28.02, contrôlé avec S.23.01 R0600)", levels: ["Solo"],
    solo: [one(ref("S.28.01", "R0400", "C0070")), one(ref("S.28.02", "R0400", "C0130"))],
  },
  {
    id: "own_funds", label: "Fonds propres éligibles", short: "Fonds propres", unit: "keur", kind: "Publié", branch: "any",
    definition: "Fonds propres éligibles pour couvrir le SCR", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.23.01", "R0540", "C0010"))],
    group: [one(ref("S.23.01", "R0660", "C0010")), one(ref("S.23.01", "R0560", "C0010"))],
  },
  {
    id: "tier1_share", label: "Part de Tier 1", short: "Tier 1", unit: "pct", kind: "Calculé", branch: "any",
    definition: "Tier 1 / fonds propres éligibles", levels: ["Solo", "Groupe"],
    solo: [{
      terms: [
        { ref: ref("S.23.01", "R0540", "C0020"), optional: true },
        { ref: ref("S.23.01", "R0540", "C0030"), optional: true },
        { ref: ref("S.23.01", "R0540", "C0010") },
      ],
      formula: "S.23.01 R0540 : (C0020 + C0030) / C0010",
      compute: ([a, b, t]) => (t ? (((a ?? 0) + (b ?? 0)) / t) * 100 : null),
    }],
    group: [{
      terms: [
        { ref: ref("S.23.01", "R0660", "C0020"), optional: true },
        { ref: ref("S.23.01", "R0660", "C0030"), optional: true },
        { ref: ref("S.23.01", "R0660", "C0010") },
      ],
      formula: "S.23.01 R0660 : (C0020 + C0030) / C0010",
      compute: ([a, b, t]) => (t ? (((a ?? 0) + (b ?? 0)) / t) * 100 : null),
    }],
  },
  {
    id: "gwp_nl", label: "Primes émises brutes Non-Vie", short: "Primes brutes NV", unit: "keur", kind: "Calculé", branch: "Non-Vie",
    definition: "Affaires directes + réassurance acceptée", levels: ["Solo", "Groupe"],
    solo: [sum([
      { ref: ref("S.05.01", "R0110", "C0200") },
      { ref: ref("S.05.01", "R0120", "C0200"), optional: true },
      { ref: ref("S.05.01", "R0130", "C0200"), optional: true },
    ], "S.05.01 C0200 : R0110 + R0120 + R0130")],
  },
  {
    id: "gwp_life", label: "Primes émises brutes Vie", short: "Primes brutes Vie", unit: "keur", kind: "Publié", branch: "Vie",
    definition: "Primes émises brutes", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.05.01", "R1410", "C0300"))],
  },
  {
    id: "nwp_nl", label: "Primes émises nettes Non-Vie", short: "Primes nettes NV", unit: "keur", kind: "Publié", branch: "Non-Vie",
    definition: "Primes brutes moins la part des réassureurs", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.05.01", "R0200", "C0200"))],
  },
  {
    id: "nwp_life", label: "Primes émises nettes Vie", short: "Primes nettes Vie", unit: "keur", kind: "Publié", branch: "Vie",
    definition: "Primes brutes moins la part des réassureurs", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.05.01", "R1500", "C0300"))],
  },
  {
    id: "tp_total", label: "Provisions techniques", short: "Provisions tech.", unit: "keur", kind: "Calculé", branch: "activity",
    definition: "Vie + Non-Vie + unités de compte", levels: ["Solo", "Groupe"],
    solo: [sum([
      { ref: ref("S.02.01", "R0510", "C0010"), optional: true },
      { ref: ref("S.02.01", "R0600", "C0010"), optional: true },
      { ref: ref("S.02.01", "R0690", "C0010"), optional: true },
    ], "S.02.01 C0010 : R0510 + R0600 + R0690")],
  },
  {
    id: "tp_life", label: "Provisions techniques Vie", short: "Provisions Vie", unit: "keur", kind: "Calculé", branch: "Vie",
    definition: "Vie (hors UC) + unités de compte", levels: ["Solo", "Groupe"],
    solo: [sum([
      { ref: ref("S.02.01", "R0600", "C0010"), optional: true },
      { ref: ref("S.02.01", "R0690", "C0010"), optional: true },
    ], "S.02.01 C0010 : R0600 + R0690")],
  },
  {
    id: "tp_nl", label: "Provisions techniques Non-Vie", short: "Provisions NV", unit: "keur", kind: "Publié", branch: "Non-Vie",
    definition: "Provisions techniques Non-Vie", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.02.01", "R0510", "C0010"))],
  },
  {
    id: "total_assets", label: "Total bilan", short: "Total bilan", unit: "keur", kind: "Publié", branch: "any",
    definition: "Total de l'actif", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.02.01", "R0500", "C0010"))],
  },
  {
    id: "excess", label: "Excédent d'actif sur passif", short: "Excédent A/P", unit: "keur", kind: "Publié", branch: "any",
    definition: "Actif moins passif", levels: ["Solo", "Groupe"],
    solo: [one(ref("S.02.01", "R1000", "C0010"))],
  },
  {
    id: "loss_ratio_nl", label: "Ratio de sinistralité Non-Vie", short: "Sinistralité NV", unit: "pct", kind: "Calculé", branch: "Non-Vie",
    definition: "Sinistres survenus nets / primes acquises nettes", levels: ["Solo", "Groupe"],
    solo: [{
      terms: [{ ref: ref("S.05.01", "R0400", "C0200") }, { ref: ref("S.05.01", "R0300", "C0200") }],
      formula: "S.05.01 C0200 : R0400 / R0300",
      compute: ([c, p]) => (p ? ((c ?? 0) / p) * 100 : null),
    }],
  },
  {
    id: "combined_ratio_nl", label: "Ratio combiné Non-Vie", short: "Ratio combiné NV", unit: "pct", kind: "Calculé", branch: "Non-Vie",
    definition: "(Sinistres survenus nets + dépenses engagées) / primes acquises nettes", levels: ["Solo", "Groupe"],
    solo: [{
      terms: [{ ref: ref("S.05.01", "R0400", "C0200") }, { ref: ref("S.05.01", "R0550", "C0200") }, { ref: ref("S.05.01", "R0300", "C0200") }],
      formula: "S.05.01 C0200 : (R0400 + R0550) / R0300",
      compute: ([c, e, p]) => (p ? (((c ?? 0) + (e ?? 0)) / p) * 100 : null),
    }],
  },
];

export const IND_BY_ID = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));

/** Toutes les cellules nécessaires aux indicateurs (pour les requêtes ciblées). */
export function allIndicatorRefs(): CellRef[] {
  const m = new Map<string, CellRef>();
  for (const ind of INDICATORS) for (const v of [...ind.solo, ...(ind.group ?? [])]) for (const t of v.terms) m.set(cellKey(t.ref), t.ref);
  // Cellules de contrôle reprises dans la fiche (SCR et MCR de S.23.01)
  for (const r of [ref("S.23.01", "R0580", "C0010"), ref("S.23.01", "R0600", "C0010")]) m.set(cellKey(r), r);
  return [...m.values()];
}

export interface Resolved {
  value: number | null;
  formula: string;
  sources: { ref: CellRef; cell: VCell | null; optional: boolean }[];
  missing: CellRef[];
}

/** Calcule un indicateur pour une entité-année à partir de ses cellules validées. */
export function resolve(ind: Indicator, level: Level, cells: Map<string, VCell>): Resolved {
  const variants = level === "Groupe" ? (ind.group ?? ind.solo) : ind.solo;
  if (!ind.levels.includes(level)) return { value: null, formula: "Non applicable au niveau groupe", sources: [], missing: [] };
  let best: Resolved | null = null;
  for (const v of variants) {
    const sources = v.terms.map((t) => ({ ref: t.ref, cell: cells.get(cellKey(t.ref)) ?? null, optional: !!t.optional }));
    const missing = sources.filter((s) => {
      if (!s.cell) return !s.optional || !variantHasAnyCell(sources);
      if (s.cell.is_blank || s.cell.value_keur == null) return !s.optional;
      return false;
    }).map((s) => s.ref);
    const res: Resolved = {
      value: missing.length ? null : v.compute(sources.map((s) => (s.cell && !s.cell.is_blank ? s.cell.value_keur : null))),
      formula: v.formula, sources, missing,
    };
    if (!missing.length) return res;
    best ??= res;
  }
  return best!;
}

function variantHasAnyCell(sources: { cell: VCell | null }[]) {
  return sources.some((s) => s.cell);
}

/** Un indicateur est-il visible avec ce filtre de branche et ces types d'entités ? */
export function indicatorVisible(ind: Indicator, branch: Branch, types: EntityType[], levels: Level[]) {
  if (!levels.every((l) => ind.levels.includes(l))) return false;
  if (ind.branch === "any") return true;
  const nonMixte = new Set(types.filter((t) => t !== "Mixte"));
  if (ind.branch === "activity") return branch === "all" && nonMixte.size <= 1 && !types.includes("Mixte");
  // Indicateur d'activité Vie ou Non-Vie : filtre compatible et entités de la même branche (Mixtes incluses)
  if (branch !== "all" && branch !== ind.branch) return false;
  return types.every((t) => t === ind.branch || t === "Mixte");
}

export function isActivity(ind: Indicator) {
  return ind.branch !== "any";
}

export function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Entités retenues pour la médiane de référence : même niveau, même année ; même branche pour l'activité. */
export function medianPeers(ind: Indicator, level: Level, entities: Entity[], type?: EntityType) {
  return entities.filter((e) => {
    if (e.level !== level) return false;
    if (ind.branch === "Vie" || ind.branch === "Non-Vie") return e.type === ind.branch || e.type === "Mixte";
    if (ind.branch === "activity") return !type || e.type === type;
    return true;
  });
}
