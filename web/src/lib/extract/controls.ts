// Contrôles de cohérence (PRD V2, section 4). Un échec envoie les cellules concernées en file de revue.
// Les montants sont comparés en kEUR (après application du facteur d'unité proposé).

export interface CtlCell {
  family: string;
  row: string;
  col: string;
  value: number | null; // kEUR, ou % pour un ratio
  isBlank: boolean;
  isRatio: boolean;
}

export interface ControlOutcome {
  code: string;
  label: string;
  status: "passed" | "failed" | "skipped";
  expected: number | null;
  actual: number | null;
  tolerance: string;
  message: string | null;
  cellKeys: string[];
}

export interface ControlContext {
  level: "Solo" | "Groupe";
  /** Ratio affiché par le CAA, seulement si le SFCR porte sur le dernier exercice. */
  caaRatio: number | null;
  /** Valeurs validées de l'exercice précédent, par clé « famille|ligne|colonne ». */
  previous: Map<string, number> | null;
}

const AMOUNT_TOL = 2;
const RATIO_TOL = 1;

export function runControls(cells: CtlCell[], ctx: ControlContext): ControlOutcome[] {
  const m = new Map(cells.map((c) => [`${c.family}|${c.row}|${c.col}`, c]));
  const get = (k: string) => {
    const c = m.get(k);
    return c && !c.isBlank && c.value != null ? c.value : null;
  };
  const first = (...keys: string[]) => keys.find((k) => get(k) != null) ?? null;
  const out: ControlOutcome[] = [];

  const cmp = (code: string, label: string, expected: number | null, actual: number | null, keys: string[], tol: number, unit: "kEUR" | "pts") => {
    if (expected == null || actual == null) {
      out.push({ code, label, status: "skipped", expected, actual, tolerance: `± ${tol} ${unit}`, message: "Cellules absentes", cellKeys: keys });
      return;
    }
    const ok = Math.abs(expected - actual) <= tol;
    out.push({
      code, label, status: ok ? "passed" : "failed", expected, actual, tolerance: `± ${tol} ${unit}`,
      message: ok ? null : `Écart de ${Math.round((actual - expected) * 100) / 100} ${unit}`, cellKeys: keys,
    });
  };

  // 1. Bilan : total actif = total passif + excédent d'actif sur passif
  {
    const a = get("S.02.01|R0500|C0010"), l = get("S.02.01|R0900|C0010"), e = get("S.02.01|R1000|C0010");
    cmp("balance", "Bilan S.02.01 : total actif = total passif + excédent", a, l != null && e != null ? l + e : null,
      ["S.02.01|R0500|C0010", "S.02.01|R0900|C0010", "S.02.01|R1000|C0010"], AMOUNT_TOL, "kEUR");
  }

  // 2. SCR de S.25 = SCR repris dans S.23.01
  {
    const scrKey = first("S.25.01|R0220|C0100", "S.25.01|R0220|C0110", "S.25.05|R0220|C0100", "S.25.05|R0220|C0110",
      "S.25.02|R0220|C0100", "S.25.03|R0220|C0100");
    const ofKey = ctx.level === "Groupe" ? first("S.23.01|R0680|C0010", "S.23.01|R0590|C0010") : "S.23.01|R0580|C0010";
    cmp("scr_s25_s23", "SCR de S.25 = SCR repris dans S.23.01", scrKey ? get(scrKey) : null, ofKey ? get(ofKey) : null,
      [scrKey ?? "S.25.01|R0220|C0100", ofKey ?? "S.23.01|R0580|C0010"], AMOUNT_TOL, "kEUR");
  }

  // 3. MCR de S.28 = MCR repris dans S.23.01 (solo uniquement)
  if (ctx.level === "Solo") {
    const k = first("S.28.01|R0400|C0070", "S.28.02|R0400|C0130");
    cmp("mcr_s28_s23", "MCR de S.28 = MCR repris dans S.23.01", k ? get(k) : null, get("S.23.01|R0600|C0010"),
      [k ?? "S.28.01|R0400|C0070", "S.23.01|R0600|C0010"], AMOUNT_TOL, "kEUR");
  }

  // 4. Provisions de S.12.01 et S.17.01 = provisions du bilan
  if (m.has("S.12.01|R0200|C0150") || m.has("S.12.01|R0200|C0210")) {
    const s12 = (get("S.12.01|R0200|C0150") ?? 0) + (get("S.12.01|R0200|C0210") ?? 0);
    // R0600 peut être laissé vide alors que ses composantes (R0610 santé similaire à la vie, R0650 vie) sont remplies
    const life = get("S.02.01|R0600|C0010") ?? (get("S.02.01|R0610|C0010") ?? 0) + (get("S.02.01|R0650|C0010") ?? 0);
    const bs = life + (get("S.02.01|R0690|C0010") ?? 0);
    cmp("tp_life", "Provisions S.12.01 = provisions Vie du bilan (R0600 + R0690)",
      m.has("S.02.01|R0600|C0010") || m.has("S.02.01|R0690|C0010") ? bs : null, s12,
      ["S.12.01|R0200|C0150", "S.12.01|R0200|C0210", "S.02.01|R0600|C0010", "S.02.01|R0610|C0010", "S.02.01|R0650|C0010", "S.02.01|R0690|C0010"], AMOUNT_TOL, "kEUR");
  }
  if (m.has("S.17.01|R0320|C0180")) {
    cmp("tp_nonlife", "Provisions S.17.01 = provisions Non-Vie du bilan (R0510)", get("S.02.01|R0510|C0010"), get("S.17.01|R0320|C0180"),
      ["S.17.01|R0320|C0180", "S.02.01|R0510|C0010"], AMOUNT_TOL, "kEUR");
  }

  // 5. Ratio recalculé = ratio publié
  {
    const [of, scr, ratio] = ctx.level === "Groupe"
      ? [first("S.23.01|R0660|C0010", "S.23.01|R0560|C0010"), first("S.23.01|R0680|C0010", "S.23.01|R0590|C0010"), first("S.23.01|R0690|C0010", "S.23.01|R0630|C0010")]
      : ["S.23.01|R0540|C0010", "S.23.01|R0580|C0010", "S.23.01|R0620|C0010"];
    const o = of ? get(of) : null, s = scr ? get(scr) : null;
    cmp("ratio_recalc", "Ratio recalculé (fonds propres éligibles / SCR) = ratio publié", o != null && s ? (o / s) * 100 : null, ratio ? get(ratio) : null,
      [of, scr, ratio].filter(Boolean) as string[], RATIO_TOL, "pts");
  }

  // 6. Ratio publié = ratio affiché par le CAA (dernier exercice)
  if (ctx.caaRatio != null) {
    const rk = ctx.level === "Groupe" ? first("S.23.01|R0690|C0010", "S.23.01|R0630|C0010") : "S.23.01|R0620|C0010";
    cmp("ratio_caa", "Ratio publié = ratio affiché par le CAA", ctx.caaRatio, rk ? get(rk) : null, rk ? [rk] : [], RATIO_TOL, "pts");
  }

  // 7. Variation annuelle entre ×500 et ×2 000 (ou ÷) : erreur d'unité probable
  if (ctx.previous) {
    const suspects: string[] = [];
    for (const c of cells) {
      if (c.isRatio || c.isBlank || c.value == null || c.value === 0) continue;
      const k = `${c.family}|${c.row}|${c.col}`;
      const p = ctx.previous.get(k);
      if (!p) continue;
      const r = Math.abs(c.value / p);
      if ((r >= 500 && r <= 2000) || (r >= 1 / 2000 && r <= 1 / 500)) suspects.push(k);
    }
    out.push({
      code: "yoy_unit", label: "Variation annuelle ×500 à ×2 000 : erreur d'unité probable",
      status: suspects.length ? "failed" : "passed", expected: null, actual: null, tolerance: "×500 – ×2 000",
      message: suspects.length ? `${suspects.length} cellule(s) suspecte(s)` : null, cellKeys: suspects,
    });
  }
  return out;
}
