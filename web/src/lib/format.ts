// Règles d'affichage du design system (section « Valeurs ») :
// montants en kEUR, espace fine comme séparateur, alignés à droite ; non renseigné « — » ; ratios en %.
export type DisplayUnit = "kEUR" | "MEUR";

const NNBSP = " "; // espace fine insécable

function group(n: number, decimals: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/\s/g, NNBSP);
}

export function fmtAmount(v: number | null | undefined, unit: DisplayUnit = "kEUR", withUnit = false) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const x = unit === "MEUR" ? v / 1000 : v;
  const s = group(x, unit === "MEUR" ? 1 : 0);
  return withUnit ? `${s} ${unit}` : s;
}

export function fmtPct(v: number | null | undefined, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${group(v, decimals)}${NNBSP}%`;
}

export function fmtValue(v: number | null | undefined, kind: "keur" | "pct", unit: DisplayUnit = "kEUR", withUnit = false) {
  return kind === "pct" ? fmtPct(v, 1) : fmtAmount(v, unit, withUnit);
}

/** Variation N / N-1 : signe toujours affiché ; en points pour les ratios. */
export function fmtDelta(cur: number | null | undefined, prev: number | null | undefined, kind: "keur" | "pct", unit: DisplayUnit = "kEUR") {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  if (kind === "pct") return `${sign}${group(Math.abs(d), 1)}${NNBSP}pts`;
  const abs = `${sign}${fmtAmount(Math.abs(d), unit)}`;
  const pct = prev !== 0 ? `${sign}${group(Math.abs((d / Math.abs(prev)) * 100), 1)}${NNBSP}%` : "n.s.";
  return `${abs} · ${pct}`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const ORIGIN_LABEL: Record<string, string> = {
  caa: "CAA",
  site: "Site de la compagnie",
  import: "Import",
  archive: "Archive web",
};

export const LEGAL_NOTICE =
  "Données issues des publications des compagnies, dont le CAA ne garantit pas l'exactitude.";
