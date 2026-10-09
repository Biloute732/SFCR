// Moteur d'extraction des QRT (US4) et de détection unité / devise / année (US2, US5).
// Fonctions pures sur le texte positionné : testables hors navigateur.
import { familyOf, isRatioCell, QRT_BY_FAMILY, QRTS, ROW_LABEL_MATCHERS } from "../qrt";
import { groupLines, type Item, type PageText } from "./lines";

export const EXTRACTOR_VERSION = "1.0.0";

export interface ExtractedCell {
  family: string;
  row: string;
  col: string;
  rowLabel: string | null;
  rawText: string;
  rawValue: number | null;
  isBlank: boolean;
  isRatio: boolean;
  pages: number[];
}

export interface ExtractedQrt {
  family: string;
  fullCode: string;
  pages: number[];
  matchedBy: "code" | "label";
  needsReview: boolean;
}

export interface UnitGuess {
  label: "units" | "thousands" | "millions";
  factor: number; // vers des milliers
  currency: string;
  evidence: string | null;
  page: number | null;
  explicit: boolean;
}

export interface ExtractionResult {
  qrts: ExtractedQrt[];
  cells: ExtractedCell[];
  unit: UnitGuess;
  qrtUnitOverrides: Record<string, number>;
  year: { year: number; evidence: string; page: number } | null;
  leis: string[];
  groupMembers: { lei: string | null; name: string; country: string | null; page: number }[];
  mentionsMethod2: boolean;
  log: string[];
}

// ───────────────────────── Nombres ─────────────────────────
const BLANK_TOKENS = new Set(["-", "–", "—", "n/a", "N/A", "n.a.", "N.A.", "x", "X"]);
const NUM_RE = /^[(−\-–]?\s*[€$£]?\s*\d[\d\s.,']*\s*%?\)?$/;

export function isNumericToken(s: string) {
  const t = s.trim();
  return BLANK_TOKENS.has(t) || NUM_RE.test(t);
}

/** Lit un nombre tel qu'imprimé : « 1 234 567 », « 1,234,567 », « 1.234,5 », « (1 234) », « 212 % ». */
export function parseNumber(s: string, ratioHint = false): { value: number | null; blank: boolean; pct: boolean } {
  let t = s.trim();
  if (!t || BLANK_TOKENS.has(t)) return { value: null, blank: true, pct: false };
  const neg = /^\(.*\)$/.test(t) || /^[−\-–]/.test(t);
  const pct = /%\)?$/.test(t);
  t = t.replace(/[()−\-–%€$£'\s]/g, "");
  if (!t) return { value: null, blank: true, pct };
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  let norm: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // les deux séparateurs : le dernier est le séparateur décimal
    const dec = lastDot > lastComma ? "." : ",";
    const th = dec === "." ? "," : ".";
    norm = t.split(th).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = t.split(sep);
    const decimalLike = parts.length === 2 && (parts[1].length !== 3 || ratioHint || pct || parts[0] === "0");
    norm = decimalLike ? parts.join(".") : parts.join("");
  } else norm = t;
  const v = Number(norm);
  if (!Number.isFinite(v)) return { value: null, blank: true, pct };
  return { value: neg ? -v : v, blank: false, pct };
}

// ───────────────────────── Découpage des éléments ─────────────────────────
/** Sépare les éléments qui contiennent plusieurs jetons (« C0010 C0020 », « 1 234   5 678 »). */
function splitItems(items: Item[]): Item[] {
  const out: Item[] = [];
  for (const it of items) {
    const parts = it.str.split(/(\s{2,}|\s(?=[RC]\d{4}\b)|(?<=\b[RC]\d{4})\s)/).filter((p) => p && !/^\s+$/.test(p));
    if (parts.length <= 1) { out.push({ ...it, str: it.str.trim() }); continue; }
    const cw = (it.x2 - it.x) / Math.max(1, it.str.length);
    let pos = 0;
    for (const p of parts) {
      const idx = it.str.indexOf(p, pos);
      pos = idx + p.length;
      out.push({ ...it, str: p.trim(), x: it.x + idx * cw, x2: it.x + pos * cw });
    }
  }
  return out;
}

/** Recolle « 1 » « 234 » « 567 » imprimés en éléments séparés. */
function mergeNumberFragments(line: Item[]): Item[] {
  const out: Item[] = [];
  for (const it of line) {
    const prev = out[out.length - 1];
    if (prev && /^[(−\-–]?\d{1,3}([\s.,]\d{3})*$/.test(prev.str) && /^\d{3}([.,]\d+)?\)?%?$/.test(it.str)
      && it.x - prev.x2 < Math.max(2.5, it.h * 0.45)) {
      out[out.length - 1] = { ...prev, str: `${prev.str} ${it.str}`, x2: it.x2 };
    } else out.push(it);
  }
  return out;
}

const QRT_CODE_RE = /\bS\.\s?(\d{2})\.\s?(\d{2})\.\s?(\d{2})(?:\.\d{2})?\b/;
const ROW_RE = /^R\d{4}$/;
const COL_RE = /^C\d{4}$/;
const LEI_RE = /\b(?=[0-9A-Z]{20}\b)(?=[0-9A-Z]*[A-Z])[0-9A-Z]{18}\d{2}\b/g;

interface ColHeader { code: string; xc: number }

const colNum = (c: string) => parseInt(c.slice(1), 10);
const colCode = (n: number) => `C${String(n).padStart(4, "0")}`;

/**
 * En-tête incomplet (certains codes C… non imprimés ou illisibles) : si les codes lus se suivent
 * de 10 en 10, on prolonge la série à gauche et à droite avec le même pas pour couvrir les montants.
 */
function extendHeader(header: ColHeader[], tokens: Item[]): ColHeader[] {
  const cols = [...header].sort((a, b) => a.xc - b.xc);
  if (cols.length < 2 || !tokens.length) return cols;
  const nums = cols.map((c) => colNum(c.code));
  if (!nums.every((n, i) => i === 0 || n - nums[i - 1] === 10)) return cols;
  const step = (cols[cols.length - 1].xc - cols[0].xc) / (cols.length - 1);
  if (step <= 0) return cols;
  const left = Math.min(...tokens.map((t) => t.x * 0.35 + t.x2 * 0.65));
  const right = Math.max(...tokens.map((t) => t.x * 0.35 + t.x2 * 0.65));
  while (left < cols[0].xc - step * 0.5 && colNum(cols[0].code) > 10) {
    cols.unshift({ code: colCode(colNum(cols[0].code) - 10), xc: cols[0].xc - step });
  }
  while (right > cols[cols.length - 1].xc + step * 0.5 && cols.length < 40) {
    cols.push({ code: colCode(colNum(cols[cols.length - 1].code) + 10), xc: cols[cols.length - 1].xc + step });
  }
  return cols;
}

function assignToColumns(tokens: Item[], header: ColHeader[]): Map<string, Item> {
  const res = new Map<string, Item>();
  if (!header.length) return res;
  const cols = [...header].sort((a, b) => a.xc - b.xc);
  const bounds = cols.map((c, i) => ({
    code: c.code,
    lo: i === 0 ? -Infinity : (cols[i - 1].xc + c.xc) / 2,
    hi: i === cols.length - 1 ? Infinity : (c.xc + cols[i + 1].xc) / 2,
  }));
  for (const t of tokens) {
    // les montants sont alignés à droite : on pondère vers le bord droit
    const xc = t.x * 0.35 + t.x2 * 0.65;
    const b = bounds.find((bd) => xc >= bd.lo && xc < bd.hi);
    if (b && !res.has(b.code)) res.set(b.code, t);
  }
  return res;
}

/**
 * Libellé sur plusieurs lignes : le code R… et les montants peuvent être imprimés à des hauteurs
 * légèrement différentes. Une ligne R… sans montant récupère ceux d'une ligne voisine sans code R….
 */
function attachOffsetValues(lines: Item[][]) {
  const used = new Set<number>();
  lines.forEach((line, i) => {
    const r = line.find((it) => ROW_RE.test(it.str));
    if (!r || line.some((it) => it.x > r.x2 && isNumericToken(it.str))) return;
    let best = -1, bestDy = Infinity;
    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
      if (j === i || used.has(j)) continue;
      const other = lines[j];
      if (other.some((it) => ROW_RE.test(it.str) || COL_RE.test(it.str))) continue;
      const dy = Math.abs(other[0].y - r.y);
      if (dy <= Math.max(r.h * 2, 10) && dy < bestDy && other.some((it) => it.x > r.x2 && isNumericToken(it.str))) { best = j; bestDy = dy; }
    }
    if (best >= 0) {
      used.add(best);
      const moved = lines[best].filter((it) => it.x > r.x2 && isNumericToken(it.str));
      line.push(...moved);
      lines[best] = lines[best].filter((it) => !moved.includes(it));
      line.sort((a, b) => a.x - b.x);
    }
  });
}

// ───────────────────────── Extraction principale ─────────────────────────
export function extractQrts(pages: PageText[], level: "Solo" | "Groupe" = "Solo"): ExtractionResult {
  const log: string[] = [];
  const qrts = new Map<string, ExtractedQrt>();
  const cells = new Map<string, ExtractedCell>();
  let current: string | null = null;
  let header: ColHeader[] = [];

  const put = (c: ExtractedCell) => {
    const k = `${c.family}|${c.row}|${c.col}`;
    const prev = cells.get(k);
    if (!prev || (prev.isBlank && !c.isBlank)) cells.set(k, c);
  };

  for (const pg of pages) {
    const lines = groupLines(splitItems(pg.items)).map(mergeNumberFragments);
    attachOffsetValues(lines);
    let pageHasRows = false;
    let lastWasHeader = false;
    for (const line of lines) {
      const text = line.map((i) => i.str).join(" ");
      const m = text.match(QRT_CODE_RE);
      const rowIdx = line.findIndex((i) => ROW_RE.test(i.str));
      const wasHeader = lastWasHeader;
      lastWasHeader = false;
      if (m && rowIdx < 0) {
        const fam = familyOf(m[0].replace(/\s/g, ""));
        if (QRT_BY_FAMILY[fam] && QRT_BY_FAMILY[fam].phase === "MVP") {
          if (fam !== current) header = [];
          current = fam;
          const q = qrts.get(fam) ?? { family: fam, fullCode: m[0].replace(/\s/g, "").split(".").slice(0, 4).join("."), pages: [], matchedBy: "code" as const, needsReview: false };
          if (!q.pages.includes(pg.page)) q.pages.push(pg.page);
          qrts.set(fam, q);
        }
        continue;
      }
      const cols = line.filter((i) => COL_RE.test(i.str));
      if (cols.length >= 1 && rowIdx < 0 && cols.length >= line.length / 2) {
        const h = cols.map((c) => ({ code: c.str, xc: (c.x + c.x2) / 2 }));
        // En-tête imprimé sur deux lignes : on fusionne
        header = wasHeader ? [...header.filter((x) => !h.some((y) => y.code === x.code)), ...h] : h;
        lastWasHeader = true;
        continue;
      }
      if (rowIdx < 0 || !current) continue;
      pageHasRows = true;
      const q = qrts.get(current)!;
      if (!q.pages.includes(pg.page)) q.pages.push(pg.page); // tableau coupé sur deux pages
      const row = line[rowIdx].str;
      const labelParts = line.slice(0, rowIdx).filter((i) => !isNumericToken(i.str));
      const after = line.slice(rowIdx + 1);
      const values = after.filter((i) => isNumericToken(i.str));
      const rowLabel = (labelParts.length ? labelParts : after.filter((i) => !isNumericToken(i.str))).map((i) => i.str).join(" ").trim() || null;

      if (current === "S.32.01") continue; // liste d'entités : traitée à part

      if (header.length) {
        const cols = extendHeader(header, values);
        const assigned = assignToColumns(values, cols);
        for (const h of cols) {
          const tok = assigned.get(h.code);
          const ratio = isRatioCell(current, row, h.code);
          const p = tok ? parseNumber(tok.str, ratio) : { value: null, blank: true, pct: false };
          put(mkCell(current, row, h.code, rowLabel, tok?.str ?? "", p, ratio, pg.page));
        }
      } else if (values.length) {
        // Pas d'en-tête C… lisible : colonnes supposées dans l'ordre, le QRT part en revue
        q.needsReview = true;
        values.forEach((tok, i) => {
          const col = `C${String((i + 1) * 10).padStart(4, "0")}`;
          const ratio = isRatioCell(current!, row, col);
          put(mkCell(current!, row, col, rowLabel, tok.str, parseNumber(tok.str, ratio), ratio, pg.page));
        });
      }
    }
    if (!pageHasRows && current && !qrts.get(current)?.pages.includes(pg.page)) {
      // page sans ligne R… ni code : fin du tableau courant
      current = null;
      header = [];
    }
  }
  log.push(`${qrts.size} QRT repérés par leur code, ${cells.size} cellules lues`);

  // QRT sans codes R/C : rapprochement par libellé (FR / EN / DE), part en revue
  for (const def of QRTS) {
    if (qrts.has(def.family) || def.phase !== "MVP") continue;
    const matchers = ROW_LABEL_MATCHERS.filter((mm) => mm.family === def.family);
    if (!matchers.length) continue;
    for (const pg of pages) {
      const head = pg.text.split("\n").slice(0, 8).join(" ");
      if (!def.labels.test(head)) continue;
      let found = 0;
      for (const line of groupLines(splitItems(pg.items)).map(mergeNumberFragments)) {
        const label = line.filter((i) => !isNumericToken(i.str)).map((i) => i.str).join(" ").trim();
        const nums = line.filter((i) => isNumericToken(i.str) && !BLANK_TOKENS.has(i.str.trim()));
        const mm = matchers.find((x) => x.re.test(label));
        if (!mm || !nums.length) continue;
        const ratio = isRatioCell(def.family, mm.row, "C0010");
        put(mkCell(def.family, mm.row, "C0010", label, nums[0].str, parseNumber(nums[0].str, ratio), ratio, pg.page));
        found++;
      }
      if (found) {
        qrts.set(def.family, { family: def.family, fullCode: (level === "Groupe" ? def.group : def.solo) ?? def.family, pages: [pg.page], matchedBy: "label", needsReview: true });
        log.push(`${def.family} rapproché par libellé p. ${pg.page} (${found} lignes) : en revue`);
        break;
      }
    }
  }

  const fullText = pages.map((p) => p.text).join("\n");
  const qrtPageList = [...qrts.values()].flatMap((q) => q.pages);
  const unit = detectUnit(pages, qrtPageList);
  // Montants imprimés avec centimes dans les QRT : l'unité est très probablement l'euro
  const amounts = [...cells.values()].filter((c) => !c.isBlank && !c.isRatio && c.rawValue != null && Math.abs(c.rawValue) >= 1000);
  const withCents = amounts.filter((c) => /[.,]\d{2}\)?$/.test(c.rawText.trim()));
  const unitOnQrtPage = unit.page != null && qrtPageList.includes(unit.page);
  if (amounts.length >= 20 && withCents.length / amounts.length >= 0.6 && unit.label !== "units" && !unitOnQrtPage) {
    log.push(`Unité « ${unit.label} » lue p. ${unit.page ?? "-"} hors QRT, mais ${withCents.length}/${amounts.length} montants ont des centimes : euro proposé`);
    Object.assign(unit, {
      label: "units", factor: 0.001, explicit: false,
      evidence: `Montants des QRT imprimés au centime (ex. « ${withCents[0].rawText} »)`, page: withCents[0].pages[0],
    });
  }
  const qrtUnitOverrides: Record<string, number> = {};
  for (const q of qrts.values()) {
    const u = detectUnit(pages.filter((p) => q.pages.includes(p.page)), q.pages);
    if (u.explicit && unit.explicit && u.factor !== unit.factor) {
      qrtUnitOverrides[q.family] = u.factor;
      log.push(`${q.family} : unité différente (${u.label}) — exception par QRT`);
    }
  }

  // Plausibilité : un total bilan converti hors de [1 M€ ; 500 Md€] trahit une unité mal lue
  // (souvent une mention relevée dans la partie narrative et non sur les QRT).
  const ta = cells.get("S.02.01|R0500|C0010");
  if (ta?.rawValue && !(unit.page != null && qrtPageList.includes(unit.page))) {
    const keur = (f: number) => Math.abs(ta.rawValue!) * f;
    if (keur(unit.factor) > 5e8 || keur(unit.factor) < 1e3) {
      // Le millier (unité réglementaire des QRT) d'abord, puis l'euro, puis le million
      const options = [{ label: "thousands" as const, factor: 1 }, { label: "units" as const, factor: 0.001 }, { label: "millions" as const, factor: 1000 }];
      const fit = options.find((o) => keur(o.factor) >= 1e3 && keur(o.factor) <= 5e8);
      if (fit && fit.factor !== unit.factor) {
        log.push(`Total bilan « ${ta.rawText} » invraisemblable en ${unit.label} : ${fit.label} proposé`);
        Object.assign(unit, { ...fit, explicit: false, evidence: `Total bilan imprimé « ${ta.rawText} » : unité « ${fit.label} » la seule plausible`, page: ta.pages[0] });
      }
    }
  }

  return {
    qrts: [...qrts.values()],
    cells: [...cells.values()],
    unit,
    qrtUnitOverrides,
    year: detectYear(pages),
    leis: [...new Set(fullText.match(LEI_RE) ?? [])],
    groupMembers: extractGroupMembers(pages, qrts.get("S.32.01")?.pages ?? []),
    mentionsMethod2: /(deduction and aggregation|d[ée]duction[- ]et[- ]agr[ée]gation|d[ée]duction[- ]agr[ée]gation|method 2\b|m[ée]thode 2\b|abzugs- und aggregationsmethode)/i.test(fullText),
    log,
  };
}

function mkCell(family: string, row: string, col: string, rowLabel: string | null, rawText: string,
  p: { value: number | null; blank: boolean; pct: boolean }, ratio: boolean, page: number): ExtractedCell {
  let v = p.value;
  // Ratio imprimé en décimal (2,12) : exprimé en % pour l'affichage — jamais converti d'unité
  if ((ratio || p.pct) && v != null && !p.pct && Math.abs(v) <= 20) v = v * 100;
  return { family, row, col, rowLabel, rawText, rawValue: v, isBlank: p.blank, isRatio: ratio || p.pct, pages: [page] };
}

// ───────────────────────── Unité et devise (US5) ─────────────────────────
const UNIT_PATTERNS: { label: UnitGuess["label"]; re: RegExp }[] = [
  { label: "thousands", re: /(in thousands|thousands of|in ['’]?000s?|\b(?:EUR|USD|GBP|CHF)\s?(?:k|['’]000|000s?)\b|\bk\s?(?:EUR|€)|€\s?['’]?000|\bT(?:EUR|€)\b|K€|en milliers|milliers d['’]euros|en k€|in tausend|tsd\.?\s?(?:EUR|€))/i },
  { label: "millions", re: /(in millions|millions of|\b(?:EUR|USD|GBP|CHF)\s?(?:m|mn|mio)\b|\bm\s?(?:EUR|€)\b|M€|en millions|millions d['’]euros|in millionen|mio\.?\s?(?:EUR|€))/i },
  { label: "units", re: /((?:amounts?|figures|montants|chiffres|betr[äa]ge|balance sheet|bilan)[^.]{0,50}\b(?:in|en|expressed in|presented in|exprim[ée]s en)\s+(?:EUR|euros?)\b(?!\s?(?:k\b|['’]000|thousand|million|milliers|tausend))|\((?:en|in) (?:€|EUR)\))/i },
];
const CURRENCY_RE = /\b(?:in|en)\s+(?:thousands?\s+of\s+|milliers\s+de\s+|millions?\s+of\s+)?(USD|GBP|CHF|JPY|SEK|NOK|DKK)\b|\b(USD|GBP|CHF|JPY|SEK|NOK|DKK)\s?(?:['’]000|000|k|thousands?|m\b|millions?)/i;

export function detectUnit(pages: PageText[], qrtPages: number[]): UnitGuess {
  const scored: { label: UnitGuess["label"]; score: number; evidence: string; page: number }[] = [];
  let currency = "EUR";
  for (const pg of pages) {
    const weight = qrtPages.includes(pg.page) ? 5 : 1;
    for (const line of pg.text.split("\n")) {
      for (const u of UNIT_PATTERNS) {
        if (u.re.test(line)) scored.push({ label: u.label, score: weight, evidence: line.trim().slice(0, 200), page: pg.page });
      }
      const c = line.match(CURRENCY_RE);
      if (c && weight > 1) currency = (c[1] ?? c[2]).toUpperCase();
    }
  }
  const factor = { units: 0.001, thousands: 1, millions: 1000 } as const;
  if (!scored.length) {
    // Sans mention explicite : le millier est proposé, mais le SFCR reste bloqué jusqu'à validation
    return { label: "thousands", factor: 1, currency, evidence: null, page: null, explicit: false };
  }
  const totals = new Map<string, number>();
  for (const s of scored) totals.set(s.label, (totals.get(s.label) ?? 0) + s.score);
  const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0] as UnitGuess["label"];
  const ev = scored.filter((s) => s.label === best).sort((a, b) => b.score - a.score)[0];
  return { label: best, factor: factor[best], currency, evidence: ev.evidence, page: ev.page, explicit: true };
}

// ───────────────────────── Année de référence (lue dans le document) ─────────────────────────
const YEAR_PATTERNS = [
  /31(?:st|er)?[\s./-]*(?:12|d[ée]c(?:embre)?\.?|dec(?:ember)?\.?|dez(?:ember)?\.?)[\s./-]*(20\d{2})/gi,
  /(?:december|d[ée]cembre|dezember)\s+31(?:st)?,?\s+(20\d{2})/gi,
  /(?:year|exercice|financial year|reporting year|gesch[äa]ftsjahr)\s+(?:ended\s+|clos\s+(?:le\s+)?)?(20\d{2})/gi,
];

export function detectYear(pages: PageText[]): { year: number; evidence: string; page: number } | null {
  const score = new Map<number, number>();
  const first = new Map<number, { evidence: string; page: number }>();
  const maxYear = new Date().getFullYear();
  pages.forEach((pg, idx) => {
    const w = idx < 5 ? 3 : 1;
    for (const re of YEAR_PATTERNS) {
      re.lastIndex = 0;
      for (const m of pg.text.matchAll(re)) {
        const y = +m[1];
        if (y < 2016 || y > maxYear) continue;
        score.set(y, (score.get(y) ?? 0) + w);
        if (!first.has(y)) {
          const i = m.index ?? 0;
          first.set(y, { evidence: pg.text.slice(Math.max(0, i - 40), i + m[0].length + 40).replace(/\s+/g, " ").trim(), page: pg.page });
        }
      }
    }
  });
  if (!score.size) return null;
  const year = [...score.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return { year, ...first.get(year)! };
}

// ───────────────────────── S.32.01 : filiales ─────────────────────────
function extractGroupMembers(pages: PageText[], qrtPages: number[]) {
  const out: { lei: string | null; name: string; country: string | null; page: number }[] = [];
  for (const pg of pages.filter((p) => qrtPages.includes(p.page))) {
    for (const line of groupLines(pg.items)) {
      const text = line.map((i) => i.str).join(" ");
      const lei = text.match(LEI_RE)?.[0] ?? null;
      if (!lei) continue;
      const country = line.find((i) => /^[A-Z]{2}$/.test(i.str.trim()))?.str.trim() ?? null;
      const name = line.map((i) => i.str.trim())
        .filter((s) => s && !s.includes(lei) && !/^[A-Z]{2}$/.test(s) && !/^(LEI|SC|R\d{4}|C\d{4})/.test(s) && /[a-z]/i.test(s))
        .sort((a, b) => b.length - a.length)[0] ?? lei;
      out.push({ lei, name, country, page: pg.page });
    }
  }
  return out;
}
