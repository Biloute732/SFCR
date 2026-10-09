// Catalogue des QRT du périmètre MVP (règlement d'exécution (UE) 2023/895).
// Les cellules sont stockées sous le code « famille » (S.02.01) ; le code complet
// (S.02.01.02, S.23.01.22…) est conservé sur qrt_instances.full_code.
// Les codes de lignes sont à confronter à la taxonomie EIOPA en vigueur : tout est centralisé ici.
import type { EntityType, Level } from "./types";

export interface QrtDef {
  family: string;
  solo?: string;      // code complet solo
  group?: string;     // code complet groupe
  title: string;      // libellé officiel (anglais)
  titleFr: string;
  labels: RegExp;     // titres FR / EN / DE pour un QRT publié sans code
  /** Applicabilité solo par type d'entité ; 'optional' = « si applicable ». */
  soloFor?: Partial<Record<EntityType, "required" | "optional">>;
  groupNeed?: "required" | "optional" | "method1";
  phase: "MVP" | "V2";
}

export const QRTS: QrtDef[] = [
  {
    family: "S.02.01", solo: "S.02.01.02", group: "S.02.01.02", title: "Balance sheet", titleFr: "Bilan prudentiel",
    labels: /\b(balance sheet|bilan(?! de)|bilanz)\b/i,
    soloFor: { Vie: "required", "Non-Vie": "required", Mixte: "required" }, groupNeed: "method1", phase: "MVP",
  },
  {
    family: "S.04.05", solo: "S.04.05.21", title: "Premiums, claims and expenses by country", titleFr: "Primes, sinistres et dépenses par pays",
    labels: /(by country|par pays|nach l[äa]ndern)/i,
    soloFor: { Vie: "required", "Non-Vie": "required", Mixte: "required" }, phase: "MVP",
  },
  {
    family: "S.05.01", solo: "S.05.01.02", group: "S.05.01.02", title: "Premiums, claims and expenses by line of business", titleFr: "Primes, sinistres et dépenses par ligne d'activité",
    labels: /(by line of business|par ligne d'activit|nach gesch[äa]ftsbereichen)/i,
    soloFor: { Vie: "required", "Non-Vie": "required", Mixte: "required" }, groupNeed: "required", phase: "MVP",
  },
  {
    family: "S.05.02", group: "S.05.02.04", title: "Premiums, claims and expenses by country", titleFr: "Primes, sinistres et dépenses par pays (groupe)",
    labels: /(by country|par pays|nach l[äa]ndern)/i,
    groupNeed: "required", phase: "MVP",
  },
  {
    family: "S.12.01", solo: "S.12.01.02", title: "Life and Health SLT Technical Provisions", titleFr: "Provisions techniques Vie et Santé SLT",
    labels: /(life and health slt technical provisions|provisions techniques vie|versicherungstechnische r[üu]ckstellungen.{0,40}lebens)/i,
    soloFor: { Vie: "required", Mixte: "required" }, phase: "MVP",
  },
  {
    family: "S.17.01", solo: "S.17.01.02", title: "Non-Life Technical Provisions", titleFr: "Provisions techniques Non-Vie",
    labels: /(non-life technical provisions|provisions techniques non[- ]vie|nichtlebensversicherung)/i,
    soloFor: { "Non-Vie": "required", Mixte: "required" }, phase: "MVP",
  },
  {
    family: "S.22.01", solo: "S.22.01.21", group: "S.22.01.22", title: "Impact of long term guarantees measures and transitionals", titleFr: "Impact des mesures relatives aux garanties de long terme",
    labels: /(long term guarantee|garanties de long terme|langfristigen garantien)/i,
    soloFor: { Vie: "optional", "Non-Vie": "optional", Mixte: "optional" }, groupNeed: "optional", phase: "MVP",
  },
  {
    family: "S.23.01", solo: "S.23.01.01", group: "S.23.01.22", title: "Own funds", titleFr: "Fonds propres",
    labels: /\b(own funds|fonds propres|eigenmittel)\b/i,
    soloFor: { Vie: "required", "Non-Vie": "required", Mixte: "required" }, groupNeed: "required", phase: "MVP",
  },
  {
    family: "S.25.01", solo: "S.25.01.21", group: "S.25.01.22", title: "Solvency Capital Requirement - Standard Formula", titleFr: "SCR (formule standard)",
    labels: /(solvency capital requirement|capital de solvabilit[ée] requis|solvenzkapitalanforderung)/i,
    phase: "MVP",
  },
  {
    family: "S.25.05", solo: "S.25.05.21", group: "S.25.05.22", title: "Solvency Capital Requirement - Internal Model", titleFr: "SCR (modèle interne)",
    labels: /(internal model|mod[èe]le interne|internes modell)/i,
    phase: "MVP",
  },
  // Ancien format (règlement 2015/2452, SFCR jusqu'à 2022) : modèle interne partiel / intégral,
  // fusionnés dans S.25.05 depuis 2023. Lus pour l'historique, avec les mêmes lignes R0220 (SCR).
  {
    family: "S.25.02", solo: "S.25.02.21", group: "S.25.02.22", title: "Solvency Capital Requirement - Partial Internal Model", titleFr: "SCR (modèle interne partiel, ancien format)",
    labels: /(partial internal model|mod[èe]le interne partiel|partielles internes modell)/i,
    phase: "MVP",
  },
  {
    family: "S.25.03", solo: "S.25.03.21", group: "S.25.03.22", title: "Solvency Capital Requirement - Full Internal Model", titleFr: "SCR (modèle interne intégral, ancien format)",
    labels: /(full internal model|mod[èe]le interne int[ée]gral|vollst[äa]ndiges internes modell)/i,
    phase: "MVP",
  },
  {
    family: "S.28.01", solo: "S.28.01.01", title: "Minimum Capital Requirement - Only life or only non-life", titleFr: "MCR (Vie seule ou Non-Vie seule)",
    labels: /(minimum capital requirement|minimum de capital requis|mindestkapitalanforderung)/i,
    phase: "MVP",
  },
  {
    family: "S.28.02", solo: "S.28.02.01", title: "Minimum Capital Requirement - Both life and non-life", titleFr: "MCR (activité mixte)",
    labels: /(both life and non-life|vie et non-vie|sowohl lebens)/i,
    phase: "MVP",
  },
  {
    family: "S.32.01", group: "S.32.01.22", title: "Undertakings in the scope of the group", titleFr: "Entreprises incluses dans le périmètre du groupe",
    labels: /(undertakings in the scope of the group|entreprises dans le p[ée]rim[èe]tre du groupe|unternehmen im gruppenbereich)/i,
    groupNeed: "required", phase: "MVP",
  },
];

export const QRT_BY_FAMILY = Object.fromEntries(QRTS.map((q) => [q.family, q]));

export function familyOf(code: string) {
  const m = code.match(/S\.(\d{2})\.(\d{2})/);
  return m ? `S.${m[1]}.${m[2]}` : code;
}

export function fullCode(family: string, level: Level) {
  const q = QRT_BY_FAMILY[family];
  return (level === "Groupe" ? q?.group : q?.solo) ?? q?.solo ?? q?.group ?? family;
}

/** Codes équivalents : un QRT attendu est présent si l'un d'eux l'est (formats 2023/895 et 2015/2452). */
export const QRT_ALTERNATIVES: Record<string, string[]> = {
  "S.04.05": ["S.04.05", "S.05.02"], // par pays : S.05.02.01 pour les solos avant 2023
};
export const SCR_FAMILIES = ["S.25.01", "S.25.02", "S.25.03", "S.25.05"];

/** QRT attendus pour une entité. Les alternatives (S.25.01 / S.25.05, S.28.01 / S.28.02) sont traitées à part. */
export function expectedQrts(level: Level, type: EntityType, groupMethod: number | null) {
  const out: { family: string; need: "required" | "optional" | "not_applicable" }[] = [];
  for (const q of QRTS) {
    if ([...SCR_FAMILIES, "S.28.01", "S.28.02"].includes(q.family)) continue;
    if (level === "Solo") {
      const n = q.soloFor?.[type];
      if (n) out.push({ family: q.family, need: n });
    } else if (q.groupNeed) {
      const need = q.groupNeed === "method1" ? (groupMethod === 2 ? "not_applicable" : "required") : q.groupNeed;
      out.push({ family: q.family, need });
    }
  }
  return out;
}

/** Cellules dont la valeur est un ratio ou un pourcentage (jamais convertie). */
export const RATIO_CELLS = new Set([
  "S.23.01|R0620|C0010", "S.23.01|R0640|C0010", "S.23.01|R0630|C0010", "S.23.01|R0650|C0010", "S.23.01|R0690|C0010",
]);

export const isRatioCell = (family: string, row: string, col: string) => RATIO_CELLS.has(`${family}|${row}|${col}`);

export type CellRef = { qrt: string; row: string; col: string };
export const ref = (qrt: string, row: string, col: string): CellRef => ({ qrt, row, col });
export const cellKey = (r: CellRef) => `${r.qrt}|${r.row}|${r.col}`;

/** Libellés de lignes clés (anglais officiel) — affichés quand l'extraction n'a pas lu de libellé. */
export const ROW_LABELS: Record<string, string> = {
  "S.02.01|R0500": "Total assets",
  "S.02.01|R0510": "Technical provisions – non-life",
  "S.02.01|R0600": "Technical provisions – life (excluding index-linked and unit-linked)",
  "S.02.01|R0690": "Technical provisions – index-linked and unit-linked",
  "S.02.01|R0900": "Total liabilities",
  "S.02.01|R1000": "Excess of assets over liabilities",
  "S.23.01|R0540": "Total eligible own funds to meet the SCR",
  "S.23.01|R0550": "Total eligible own funds to meet the MCR",
  "S.23.01|R0580": "SCR",
  "S.23.01|R0600": "MCR",
  "S.23.01|R0620": "Ratio of Eligible own funds to SCR",
  "S.23.01|R0640": "Ratio of Eligible own funds to MCR",
  "S.25.01|R0200": "Solvency capital requirement excluding capital add-on",
  "S.25.01|R0220": "Solvency capital requirement",
  "S.25.05|R0220": "Solvency capital requirement",
  "S.25.02|R0220": "Solvency capital requirement",
  "S.25.03|R0220": "Solvency capital requirement",
  "S.28.01|R0400": "Minimum Capital Requirement",
  "S.28.02|R0400": "Minimum Capital Requirement",
  "S.05.01|R0110": "Premiums written – Gross – Direct Business",
  "S.05.01|R0120": "Premiums written – Gross – Proportional reinsurance accepted",
  "S.05.01|R0130": "Premiums written – Gross – Non-proportional reinsurance accepted",
  "S.05.01|R0200": "Premiums written – Net",
  "S.05.01|R0300": "Premiums earned – Net",
  "S.05.01|R0400": "Claims incurred – Net",
  "S.05.01|R0550": "Expenses incurred",
  "S.05.01|R1410": "Life – Premiums written – Gross",
  "S.05.01|R1500": "Life – Premiums written – Net",
  "S.12.01|R0200": "Technical provisions – total",
  "S.17.01|R0320": "Total Technical Provisions",
};

/** Rapprochement par libellé (QRT publié sans codes R/C) : FR, EN, DE. Le QRT part alors en revue. */
export const ROW_LABEL_MATCHERS: { family: string; row: string; re: RegExp }[] = [
  { family: "S.02.01", row: "R0500", re: /^(total assets|total de l'actif|total actif|verm[öo]genswerte insgesamt)/i },
  { family: "S.02.01", row: "R0900", re: /^(total liabilities|total du passif|total passif|verbindlichkeiten insgesamt)/i },
  { family: "S.02.01", row: "R1000", re: /^(excess of assets over liabilities|exc[ée]dent d'actif sur passif|[üu]berschuss der verm[öo]genswerte)/i },
  { family: "S.02.01", row: "R0510", re: /^(technical provisions\s*[-–]\s*non-life|provisions techniques\s*[-–]\s*non-vie|versicherungstechnische r[üu]ckstellungen\s*[-–]\s*nichtleben)/i },
  { family: "S.02.01", row: "R0600", re: /^(technical provisions\s*[-–]\s*life \(excluding|provisions techniques\s*[-–]\s*vie \(hors|versicherungstechnische r[üu]ckstellungen\s*[-–]\s*lebensversicherung \(au[ßs]er)/i },
  { family: "S.02.01", row: "R0690", re: /^(technical provisions\s*[-–]\s*index-linked|provisions techniques uc|provisions techniques\s*[-–]\s*indexées|versicherungstechnische r[üu]ckstellungen\s*[-–]\s*fonds)/i },
  { family: "S.23.01", row: "R0540", re: /^(total eligible own funds to meet the scr|total des fonds propres [ée]ligibles pour couvrir le (scr|capital de solvabilit)|gesamtbetrag der f[üu]r die erf[üu]llung der scr)/i },
  { family: "S.23.01", row: "R0580", re: /^(scr|capital de solvabilit[ée] requis|solvenzkapitalanforderung)$/i },
  { family: "S.23.01", row: "R0600", re: /^(mcr|minimum de capital requis|mindestkapitalanforderung)$/i },
  { family: "S.23.01", row: "R0620", re: /^(ratio of eligible own funds to scr|ratio fonds propres [ée]ligibles sur (scr|capital de solvabilit)|verh[äa]ltnis von anrechnungsf[äa]higen eigenmitteln zur scr)/i },
  { family: "S.23.01", row: "R0640", re: /^(ratio of eligible own funds to mcr|ratio fonds propres [ée]ligibles sur (mcr|minimum de capital)|verh[äa]ltnis von anrechnungsf[äa]higen eigenmitteln zur mcr)/i },
];
