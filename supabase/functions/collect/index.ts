// Edge function « collect » — US1, US2, US3 et cours BCE (US5).
// Actions :
//   caa_lists              lit les 3 pages SFCR du CAA, puis les registres (réassurance, captives), et met à jour les entités
//   download  {entity_ids} télécharge le dernier SFCR (lien direct, sinon page web)
//   history   {entity_ids} cherche les années d'analyse manquantes sur le site de la compagnie, puis Wayback Machine
//   fx        {currency, date}  cours de référence BCE au dernier jour de l'exercice
//   scheduled              appelé par pg_cron (en-tête x-cron-secret) : listes + téléchargement
// Les traitements longs sont découpés : la fonction traite un lot et renvoie « remaining ».
// Authentification maison (JWT d'un administrateur ou secret pg_cron) : verify_jwt désactivé.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const UA = "FORSIDES-SFCR-Comparateur/1.0 (outil interne; collecte des SFCR publics)";
const CAA_PAGES = [
  { list: "vie", type: "Vie", level: "Solo", url: "https://www.caa.lu/fr/informations/sfcr-vie" },
  { list: "non-vie", type: "Non-Vie", level: "Solo", url: "https://www.caa.lu/fr/informations/sfcr-non-vie" },
  { list: "groupes", type: "Mixte", level: "Groupe", url: "https://www.caa.lu/fr/informations/rapports-sur-la-solvabilite-et-la-situation-financiere-sfcr-groupes" },
] as const;
// Années d'analyse : règle unique en base (public.analysis_years), réglable dans Paramètres
async function analysisYears(sb: SupabaseClient): Promise<number[]> {
  const { data } = await sb.rpc("analysis_years");
  return (data as number[] | null)?.length ? (data as number[]) : [2023, 2024, 2025];
}
const TIME_BUDGET_MS = 110_000;
const MIN_DELAY_MS = 1_500; // requêtes espacées par hôte

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ───────────────────────── Politesse : délai par hôte + robots.txt ─────────────────────────
const lastHit = new Map<string, number>();
type RobotsRule = { allow: boolean; re: RegExp; len: number };
const robotsCache = new Map<string, RobotsRule[]>();

/** Motif robots.txt → expression régulière (« * » = n'importe quoi, « $ » = fin d'URL). */
function robotsPattern(p: string): RegExp {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

// ───────────────────────── Sécurité : adresses autorisées et taille maximale ─────────────────────────
// Les liens viennent de pages tierces (CAA, sites des compagnies) : seules les adresses web publiques
// sont suivies, redirections comprises, pour ne jamais faire appeler un service interne.
const MAX_BYTES = 100 * 1024 * 1024; // = limite du bucket sfcr
const MAX_REDIRECTS = 5;

function privateIp(h: string): boolean {
  const ip = h.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = ip.replace(/^::ffff:/, "").match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [+v4[1], +v4[2]];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (ip.includes(":")) return ip === "::" || ip === "::1" || /^(fc|fd|fe[89ab])/.test(ip) || ip.startsWith("::ffff:");
  return false;
}

/** Refuse tout ce qui n'est pas une adresse web publique (http/https, pas d'IP privée, pas de nom interne). */
async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Adresse refusée (${u.protocol})`);
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !host.includes(":")) {
    throw new Error(`Adresse refusée (${host})`);
  }
  if (privateIp(host)) throw new Error(`Adresse refusée (${host})`);
  // Nom de domaine : les adresses IP qu'il désigne doivent aussi être publiques (si la résolution est disponible)
  if (!/^[\d.]+$/.test(host) && !host.includes(":")) {
    for (const type of ["A", "AAAA"] as const) {
      let ips: string[] = [];
      try { ips = await Deno.resolveDns(host, type); } catch { /* résolution indisponible ou sans réponse */ }
      if (ips.some(privateIp)) throw new Error(`Adresse refusée (${host} → adresse interne)`);
    }
  }
  return u;
}

/** Lit le corps d'une réponse sans dépasser MAX_BYTES. */
async function readLimited(r: Response): Promise<ArrayBuffer> {
  const len = Number(r.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error(`Fichier trop volumineux (${Math.round(len / 1048576)} Mo)`);
  if (!r.body) return new ArrayBuffer(0);
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error(`Fichier trop volumineux (plus de ${MAX_BYTES / 1048576} Mo)`); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out.buffer;
}

async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url;
  // Redirections suivies une à une : chaque étape est revérifiée
  for (let hop = 0; ; hop++) {
    const u = await assertPublicUrl(current);
    const host = u.host;
    const wait = (lastHit.get(host) ?? 0) + MIN_DELAY_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit.set(host, Date.now());
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    let r: Response;
    try {
      r = await fetch(u, { ...init, redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
    } finally {
      clearTimeout(t);
    }
    const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!loc) return r;
    await r.body?.cancel();
    if (hop >= MAX_REDIRECTS) throw new Error("Trop de redirections");
    current = new URL(loc, u).toString();
  }
}

/** Texte d'une réponse, avec la même limite de taille. */
const readText = async (r: Response) => new TextDecoder().decode(await readLimited(r));

async function robotsAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (u.host.endsWith("archive.org")) return true;
  let rules = robotsCache.get(u.host);
  if (!rules) {
    rules = [];
    try {
      const r = await politeFetch(`${u.protocol}//${u.host}/robots.txt`);
      if (r.ok) {
        const txt = await readText(r);
        let applies = false;
        for (const raw of txt.split(/\r?\n/)) {
          const line = raw.split("#")[0].trim();
          const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
          if (!m) continue;
          const [, k, v] = m;
          const key = k.toLowerCase();
          if (key === "user-agent") applies = v === "*" || UA.toLowerCase().includes(v.toLowerCase());
          else if (applies && (key === "disallow" || key === "allow") && v) rules.push({ allow: key === "allow", re: robotsPattern(v), len: v.length });
        }
      }
    } catch { /* robots illisible : on considère autorisé */ }
    robotsCache.set(u.host, rules);
  }
  // La règle la plus longue l'emporte ; à longueur égale, Allow l'emporte
  const path = u.pathname + u.search;
  const hit = rules.filter((r) => r.re.test(path)).sort((a, b) => b.len - a.len || Number(b.allow) - Number(a.allow))[0];
  return !hit || hit.allow;
}

// ───────────────────────── Utilitaires HTML ─────────────────────────
const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&ccedil;/g, "ç")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const normName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

type CaaRow = { name: string; lei: string; ratio: number | null; pdf: string | null; page: string | null; contact: string | null };

function parseCaaTable(html: string): CaaRow[] {
  const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const rows: CaaRow[] = [];
  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const tds = tr.match(/<td[\s\S]*?<\/td>/g) ?? [];
    if (tds.length < 2) continue;
    const label = strip(tds[0]);
    const lm = label.match(/\(([A-Z0-9]{20})\)\s*$/);
    const name = (lm ? label.slice(0, lm.index) : label).trim();
    const lei = lm ? lm[1] : `NOLEI:${normName(name).replace(/ /g, "-")}`;
    const rm = strip(tds[1]).match(/(\d+(?:[.,]\d+)?)\s*%/);
    const href = (td?: string) => {
      const m = td?.match(/href="([^"]+)"/);
      return m ? decode(m[1]).trim() : null;
    };
    // Seuls les liens web (http/https) sont gardés ; « mailto: » donne le contact
    const web = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);
    let pdf = href(tds[2]);
    let contact: string | null = null;
    if (pdf?.startsWith("mailto:")) { contact = pdf.slice(7); pdf = null; }
    pdf = web(pdf);
    rows.push({ name, lei, ratio: rm ? parseFloat(rm[1].replace(",", ".")) : null, pdf, page: web(href(tds[3])), contact });
  }
  return rows;
}

// ───────────────────────── Téléchargement d'un PDF ─────────────────────────
async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isPdf(buf: ArrayBuffer) {
  const b = new Uint8Array(buf.slice(0, 1024));
  return new TextDecoder().decode(b).includes("%PDF");
}

const SFCR_LINK = /(sfcr|solvency|solvabilit|rssf|financial[-_ ]condition|situation[-_ ]financi|solvabilit|bericht)/i;

function pdfLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decode(m[1]), base).toString();
      if (!/^https?:/i.test(url)) continue;
      const text = strip(m[2]);
      if (/\.pdf($|\?)/i.test(url) || SFCR_LINK.test(text) || /mydoc|download|getattachment|get-document/i.test(url)) out.push({ url, text });
    } catch { /* lien invalide */ }
  }
  return out;
}

type Ctx = { sb: SupabaseClient; runId: string; log: (m: string) => void };

async function storePdf(ctx: Ctx, entity: { id: string; lei: string }, url: string, origin: string, buf: ArrayBuffer, yearHint?: number) {
  const hash = await sha256(buf);
  const { data: dup } = await ctx.sb.from("sfcr_documents").select("id").eq("file_hash", hash).maybeSingle();
  if (dup) return { status: "duplicate" as const, id: dup.id };
  const safeLei = entity.lei.replace(/[^A-Za-z0-9-]/g, "_");
  const path = `${origin}/${safeLei}/${hash.slice(0, 16)}.pdf`;
  const up = await ctx.sb.storage.from("sfcr").upload(path, new Blob([buf], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
  if (up.error) throw new Error("Stockage : " + up.error.message);
  const fileName = decodeURIComponent(new URL(url).pathname.split("/").pop() || "sfcr.pdf");
  const { data, error } = await ctx.sb.from("sfcr_documents").insert({
    entity_id: entity.id, storage_path: path, file_name: fileName, file_hash: hash, file_size: buf.byteLength,
    source_url: url, origin, status: "to_extract", is_current: false, candidate_year: yearHint ?? null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { status: "stored" as const, id: data.id };
}

const ROBOTS_BLOCKED = "Interdit par robots.txt";

async function fetchPdf(url: string): Promise<{ buf?: ArrayBuffer; html?: string; error?: string }> {
  if (!(await robotsAllowed(url))) return { error: ROBOTS_BLOCKED };
  try {
    const r = await politeFetch(url);
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const buf = await readLimited(r);
    if (isPdf(buf)) return { buf };
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("html")) return { html: new TextDecoder().decode(buf) };
    return { error: `Contenu inattendu (${ct || "inconnu"})` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function alert(ctx: Ctx, entityId: string | null, kind: string, message: string, url?: string | null) {
  await ctx.sb.from("alerts").insert({ run_id: ctx.runId, entity_id: entityId, kind, message, url: url ?? null });
}

// ───────────────────────── US1 : listes CAA ─────────────────────────
async function caaLists(ctx: Ctx) {
  const seen = new Set<string>();
  let created = 0, updated = 0;
  // Première lecture : rien n'est « apparu », la base est simplement initialisée
  const { count: known } = await ctx.sb.from("entities").select("id", { count: "exact", head: true }).eq("is_demo", false);
  const firstRead = !known;
  for (const p of CAA_PAGES) {
    const r = await politeFetch(p.url);
    if (!r.ok) throw new Error(`Page CAA ${p.list} : HTTP ${r.status}`);
    const rows = parseCaaTable(await readText(r));
    ctx.log(`CAA ${p.list} : ${rows.length} entités lues`);
    const { data: existing } = await ctx.sb.from("entities").select("id, lei, name, type, level, caa_list, in_caa_list").eq("level", p.level);
    for (const row of rows) {
      // Groupes sans LEI : rapprochement par nom normalisé pour éviter les doublons
      let ent = existing?.find((e) => e.lei === row.lei);
      if (!ent && row.lei.startsWith("NOLEI:")) ent = existing?.find((e) => normName(e.name) === normName(row.name));
      seen.add(ent?.lei ?? row.lei);
      const patch = {
        name: row.name, caa_list: p.list, caa_ratio: row.ratio, caa_pdf_url: row.pdf, caa_page_url: row.page,
        caa_contact: row.contact, in_caa_list: true, last_seen_at: new Date().toISOString(), source: "caa_sfcr", category: "assurance",
      };
      if (ent) {
        const back = !ent.in_caa_list;
        await ctx.sb.from("entities").update({
          ...patch,
          // Le signalement vaut « depuis la dernière lecture » : il s'efface à la lecture suivante
          ...(back ? { list_change: "new", list_change_at: new Date().toISOString() } : { list_change: null, list_change_at: null }),
          ...(ent.type === "Mixte" && p.level === "Solo" ? {} : { type: p.type }),
        }).eq("id", ent.id);
        await ctx.sb.from("entity_names").upsert({ entity_id: ent.id, name: row.name }, { onConflict: "entity_id,name", ignoreDuplicates: true });
        updated++;
      } else {
        const { data: ins } = await ctx.sb.from("entities").insert({
          ...patch, lei: row.lei, level: p.level, type: p.type,
          ...(firstRead ? {} : { list_change: "new", list_change_at: new Date().toISOString() }),
        }).select("id").single();
        if (ins) {
          await ctx.sb.from("entity_names").insert({ entity_id: ins.id, name: row.name });
          if (!firstRead) await alert(ctx, ins.id, "new_entity", `Nouvelle entité dans la liste CAA ${p.list} : ${row.name}`, p.url);
        }
        created++;
      }
    }
  }
  // Disparues depuis la dernière lecture
  const { data: all } = await ctx.sb.from("entities").select("id, lei, name, in_caa_list").eq("is_demo", false).eq("source", "caa_sfcr");
  let removed = 0;
  for (const e of all ?? []) {
    if (e.in_caa_list && !seen.has(e.lei)) {
      await ctx.sb.from("entities").update({ in_caa_list: false, list_change: "removed", list_change_at: new Date().toISOString() }).eq("id", e.id);
      await alert(ctx, e.id, "removed_entity", `${e.name} n'apparaît plus dans les listes du CAA`);
      removed++;
    }
  }
  return { created, updated, removed, total: seen.size };
}

// ───────────────────────── Registres du CAA : réassureurs et captives ─────────────────────────
// Les listes SFCR excluent les captives et ne couvrent pas la réassurance : les registres des entreprises
// agréées (CSV) les complètent. Ils ne donnent pas de lien vers les SFCR : à importer ou à saisir sur la fiche.
const REGISTERS = [
  { list: "registre-reassurance", url: "https://www.caa.lu/uploads/documents/files/csv/Reassurances.csv", kind: "reassurance" },
  { list: "registre-non-vie", url: "https://www.caa.lu/uploads/documents/files/csv/AssurancesDirectes_AssureursLuxembourgeoisNonVie.csv", kind: "direct-nonvie" },
  { list: "registre-vie", url: "https://www.caa.lu/uploads/documents/files/csv/AssurancesDirectes_AssureursLuxembourgeoisVie.csv", kind: "direct-vie" },
] as const;

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some((x) => x.trim())) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// Dirigeant = société de gestion (Aon, Marsh, SRS, WTW…) : captive de réassurance gérée
const MANAGER_COMPANY = /\b(s\.?\s?a\.?|s\.?\s?à\s?r\.?\s?l\.?|sarl|ltd|limited|managers?|management|services|solutions|consulting|gmbh|n\.?v\.?)\b/i;

async function caaRegisters(ctx: Ctx) {
  const { data: all } = await ctx.sb.from("entities").select("id, lei, name, source, in_caa_list").eq("is_demo", false);
  const byLei = new Map((all ?? []).map((e) => [e.lei, e]));
  const firstRead = !(all ?? []).some((e) => e.source === "caa_register");
  const seen = new Set<string>();
  let created = 0;
  for (const reg of REGISTERS) {
    const r = await politeFetch(reg.url);
    if (!r.ok) throw new Error(`Registre CAA ${reg.list} : HTTP ${r.status}`);
    const rows = parseCsv(await readText(r));
    ctx.log(`Registre ${reg.list} : ${rows.length} entités lues`);
    for (const row of rows) {
      const label = (row["Nom"] ?? "").trim();
      if (!label) continue;
      const lm = label.match(/\(([A-Z0-9]{20})\)\s*$/);
      const name = (lm ? label.slice(0, lm.index) : label).trim();
      const lei = lm ? lm[1] : `NOLEI:${normName(name).replace(/ /g, "-")}`;
      const manager = row["Dirigeant"] || row["Responsable"] || null;
      const address = row["Adresse"] || null;
      seen.add(lei);
      const ent = byLei.get(lei);
      if (ent?.source === "caa_sfcr") {
        // Déjà couverte par les listes SFCR : on complète seulement l'adresse et le dirigeant
        await ctx.sb.from("entities").update({ manager, address }).eq("id", ent.id);
        continue;
      }
      const category = reg.kind === "reassurance" ? (manager && MANAGER_COMPANY.test(manager) ? "captive" : "reassurance") : "captive";
      const type = reg.kind === "direct-vie" || (reg.kind === "reassurance" && /\b(life|vie|leben|l&h|health|sant[ée])\b/i.test(name)) ? "Vie" : "Non-Vie";
      if (ent) {
        await ctx.sb.from("entities").update({
          name, manager, address, in_caa_list: true, last_seen_at: new Date().toISOString(),
          ...(ent.source === "caa_register" ? { caa_list: reg.list } : {}),
          ...(ent.in_caa_list ? { list_change: null, list_change_at: null } : { list_change: "new", list_change_at: new Date().toISOString() }),
        }).eq("id", ent.id);
      } else {
        const { data: ins } = await ctx.sb.from("entities").insert({
          lei, name, level: "Solo", type, source: "caa_register", category, caa_list: reg.list, manager, address,
          ...(firstRead ? {} : { list_change: "new", list_change_at: new Date().toISOString() }),
        }).select("id").single();
        if (ins) {
          byLei.set(lei, { id: ins.id, lei, name, source: "caa_register", in_caa_list: true });
          await ctx.sb.from("entity_names").insert({ entity_id: ins.id, name });
          if (!firstRead) await alert(ctx, ins.id, "new_entity", `Nouvelle entité dans le registre CAA (${reg.list}) : ${name}`, reg.url);
        }
        created++;
      }
    }
  }
  let removed = 0;
  for (const e of all ?? []) {
    if (e.source === "caa_register" && e.in_caa_list && !seen.has(e.lei)) {
      await ctx.sb.from("entities").update({ in_caa_list: false, list_change: "removed", list_change_at: new Date().toISOString() }).eq("id", e.id);
      await alert(ctx, e.id, "removed_entity", `${e.name} n'apparaît plus dans les registres du CAA`);
      removed++;
    }
  }
  return { created, removed, total: seen.size };
}

// ───────────────────────── US2 : téléchargement du dernier SFCR ─────────────────────────
async function downloadOne(ctx: Ctx, e: { id: string; lei: string; name: string; caa_pdf_url: string | null; caa_page_url: string | null }) {
  if (!e.caa_pdf_url && !e.caa_page_url) return "unavailable";
  let res = e.caa_pdf_url ? await fetchPdf(e.caa_pdf_url) : { error: "Pas de lien direct" } as { buf?: ArrayBuffer; html?: string; error?: string };
  let url = e.caa_pdf_url;
  if (!res.buf) {
    // Lien direct cassé ou page HTML : recherche sur la page indiquée
    const pageUrl = res.html ? e.caa_pdf_url! : e.caa_page_url;
    const html = res.html ?? (pageUrl ? (await fetchPdf(pageUrl)).html : undefined);
    const candidates = html && pageUrl ? pdfLinks(html, pageUrl).filter((l) => SFCR_LINK.test(l.url + " " + l.text)) : [];
    // Page partagée par plusieurs entités (ex. groupe) : le lien qui cite l'entité d'abord, puis le plus récent
    const score = linkScore(e.name);
    candidates.sort((a, b) => score(b) - score(a) || maxYear(b.url + b.text) - maxYear(a.url + a.text));
    let found = false;
    for (const c of candidates.slice(0, 3)) {
      const r2 = await fetchPdf(c.url);
      if (r2.buf) { res = r2; url = c.url; found = true; break; }
    }
    if (!found) {
      const blocked = res.error === ROBOTS_BLOCKED;
      await alert(ctx, e.id, blocked ? "robots" : "broken_link",
        blocked ? `${e.name} : collecte interdite par le robots.txt du site, SFCR à importer manuellement` : `${e.name} : SFCR introuvable (${res.error ?? "aucun PDF sur la page"})`,
        e.caa_pdf_url ?? e.caa_page_url);
      return blocked ? "robots" : "broken";
    }
  }
  const out = await storePdf(ctx, e, url!, "caa", res.buf!);
  return out.status;
}

// Mots génériques ignorés ; « vie », « assurances », « groupe »… restent : ils distinguent les entités sœurs
const STOP = new Set(["luxembourg", "europe", "company", "the", "and", "des", "les"]);
const nameTokens = (name: string) => normName(name).split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
// Mots qui distinguent des entités sœurs sur une même page (ex. « Camca Assurance » / « Camca Réassurance »)
const SISTER_WORDS = ["reassurance", "reinsurance", "ruckversicherung", "vie", "life", "leben", "non vie", "non life", "groupe", "group", "holding", "iard"];

/** Pertinence d'un lien pour une entité : mots du nom retrouvés, moins les mots d'une entité sœur. */
function linkScore(name: string) {
  const n = ` ${normName(name)} `;
  const tokens = nameTokens(name);
  return (l: { url: string; text: string }) => {
    const t = ` ${normName(decodeURIComponent(l.url) + " " + l.text)} `;
    // Mots entiers : « reassurance » ne compte pas pour « assurance »
    const hits = tokens.filter((tok) => t.includes(` ${tok} `)).length;
    const sisters = SISTER_WORDS.filter((w) => t.includes(` ${w} `) && !n.includes(` ${w} `)).length;
    return hits - sisters;
  };
}

function maxYear(s: string) {
  const ys = [...s.matchAll(/20(1[6-9]|2\d)/g)].map((m) => +m[0]);
  return ys.length ? Math.max(...ys) : 0;
}

// ───────────────────────── US3 : historique (années d'analyse) ─────────────────────────
async function waybackSnapshot(url: string, ts: string): Promise<string | null> {
  try {
    const r = await politeFetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}&timestamp=${ts}`);
    const j = JSON.parse(await readText(r));
    const s = j?.archived_snapshots?.closest;
    return s?.available ? s.timestamp as string : null;
  } catch { return null; }
}

async function historyOne(ctx: Ctx, e: { id: string; lei: string; name: string; caa_list: string | null; caa_pdf_url: string | null; caa_page_url: string | null }) {
  const { data: have } = await ctx.sb.from("sfcr_documents").select("reference_year, candidate_year").eq("entity_id", e.id);
  const got = new Set((have ?? []).map((d) => d.reference_year ?? d.candidate_year).filter(Boolean));
  const wanted = (await analysisYears(ctx.sb)).filter((y) => !got.has(y));
  if (!wanted.length) return { stored: 0 };
  let stored = 0;

  // 1) Site de la compagnie (page SFCR indiquée par le CAA, sinon dossier du lien PDF direct)
  // Les compagnies nomment leurs fichiers soit par exercice (« SFCR 2024 » = exercice 2024), soit par année
  // de publication (« SFCR 2025 » = exercice 2024). On essaie donc, pour l'exercice N, les liens qui citent N
  // ou N+1, sans s'arrêter au premier fichier déjà connu ; l'année retenue est celle lue dans le document
  // à l'extraction (candidate_year laissé vide).
  const covered = new Set<number>();
  const pages = [e.caa_page_url, e.caa_pdf_url ? new URL(".", e.caa_pdf_url).toString() : null].filter(Boolean) as string[];
  const tried = new Set<string>();
  for (const pageUrl of [...new Set(pages)]) {
    const page = await fetchPdf(pageUrl);
    if (!page.html) continue;
    const links = pdfLinks(page.html, pageUrl).filter((l) => SFCR_LINK.test(l.url + " " + l.text));
    const best = Math.max(0, ...links.map(linkScore(e.name)));
    // Seuls les liens qui désignent le mieux l'entité (pas sa sœur « Réassurance », « Vie », le groupe…)
    const own = links.filter((l) => linkScore(e.name)(l) === best);
    for (const y of [...wanted].sort((a, b) => b - a)) {
      const mentions = (l: { url: string; text: string }, yy: number) => new RegExp(`(^|[^0-9])${yy}([^0-9]|$)`).test(decodeURIComponent(l.url) + " " + l.text);
      const cands = own.filter((l) => mentions(l, y) || mentions(l, y + 1));
      if (cands.length) covered.add(y);
      for (const c of cands) {
        if (tried.has(c.url)) continue;
        tried.add(c.url);
        const r = await fetchPdf(c.url);
        if (r.buf) {
          const s = await storePdf(ctx, e, c.url, "site", r.buf);
          if (s.status === "stored") stored++;
        }
      }
    }
  }
  for (const y of covered) wanted.splice(wanted.indexOf(y), 1);

  // 2) En dernier recours : Wayback Machine — page CAA archivée l'année suivant l'exercice
  const caaUrl = CAA_PAGES.find((p) => p.list === e.caa_list)?.url;
  for (const y of [...wanted]) {
    if (!caaUrl) break;
    const ts = await waybackSnapshot(caaUrl, `${y + 1}0901`);
    if (!ts || !ts.startsWith(String(y + 1))) continue;
    const snap = await politeFetch(`https://web.archive.org/web/${ts}id_/${caaUrl}`);
    if (!snap.ok) continue;
    const rows = parseCaaTable(await readText(snap));
    const row = rows.find((r) => r.lei === e.lei) ?? rows.find((r) => normName(r.name) === normName(e.name));
    if (!row?.pdf) continue;
    // Le PDF est d'abord cherché en ligne, puis dans l'archive
    let r = await fetchPdf(row.pdf);
    let src = row.pdf;
    let origin = "site";
    if (!r.buf) {
      const pts = await waybackSnapshot(row.pdf, `${y + 1}0901`);
      if (pts) { src = `https://web.archive.org/web/${pts}id_/${row.pdf}`; r = await fetchPdf(src); origin = "archive"; }
    }
    if (r.buf) {
      const s = await storePdf(ctx, e, src, origin, r.buf, y);
      if (s.status === "stored") { stored++; wanted.splice(wanted.indexOf(y), 1); }
    }
  }

  for (const y of wanted) {
    await ctx.sb.from("sfcr_year_flags").upsert({ entity_id: e.id, reference_year: y, flag: "not_found", note: "Ni site de la compagnie, ni archive web", updated_at: new Date().toISOString() });
  }
  return { stored };
}

// ───────────────────────── Cours BCE ─────────────────────────
async function ecbRate(ctx: Ctx, currency: string, date: string) {
  const cur = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) throw new Error("Devise invalide");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw new Error("Date invalide");
  if (cur === "EUR") return { rate: 1, date };
  const { data: cached } = await ctx.sb.from("fx_rates").select("rate, rate_date").eq("currency", cur).lte("rate_date", date).order("rate_date", { ascending: false }).limit(1).maybeSingle();
  if (cached && (new Date(date).getTime() - new Date(cached.rate_date).getTime()) < 6 * 86400_000) return { rate: +cached.rate, date: cached.rate_date };
  const start = new Date(new Date(date).getTime() - 10 * 86400_000).toISOString().slice(0, 10);
  const r = await fetch(`https://data-api.ecb.europa.eu/service/data/EXR/D.${cur}.EUR.SP00.A?startPeriod=${start}&endPeriod=${date}&format=csvdata`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`BCE : HTTP ${r.status}`);
  const lines = (await r.text()).trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const iD = head.indexOf("TIME_PERIOD"), iV = head.indexOf("OBS_VALUE");
  const last = lines.slice(1).map((l) => l.split(",")).filter((c) => c[iV]).pop();
  if (!last) throw new Error(`BCE : aucun cours ${cur} avant le ${date}`);
  const rate = parseFloat(last[iV]);
  await ctx.sb.from("fx_rates").upsert({ currency: cur, rate_date: last[iD], rate });
  return { rate, date: last[iD] };
}

// ───────────────────────── Point d'entrée ─────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Authentification : administrateur (JWT) ou pg_cron (secret partagé)
  const cronSecret = req.headers.get("x-cron-secret");
  let trigger = "manual";
  if (cronSecret) {
    const { data: ok } = await sb.rpc("check_cron_secret", { p_secret: cronSecret });
    if (!ok) return json({ error: "Non autorisé" }, 401);
    trigger = "schedule";
  } else {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    if (!u?.user) return json({ error: "Non autorisé" }, 401);
    const { data: role } = await sb.rpc("user_role", { p_user_id: u.user.id });
    if (role !== "admin") return json({ error: "Accès réservé aux administrateurs" }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vide */ }
  const action = String(body.action ?? (trigger === "schedule" ? "scheduled" : ""));

  if (action === "fx") {
    try {
      const ctx = { sb, runId: "", log: () => {} };
      return json(await ecbRate(ctx, String(body.currency), String(body.date)));
    } catch (e) { return json({ error: (e as Error).message }, 502); }
  }

  const runKind = action === "caa_lists" ? "caa_lists" : action === "download" ? "download" : action === "history" ? "history" : "scheduled";
  if (!["caa_lists", "download", "history", "scheduled"].includes(action)) return json({ error: "Action inconnue" }, 400);

  // Reprise d'une exécution existante (lots successifs) ou nouvelle exécution
  let runId = body.run_id as string | undefined;
  const logs: { at: string; msg: string }[] = [];
  if (!runId) {
    const { data } = await sb.from("collection_runs").insert({ kind: runKind, trigger }).select("id").single();
    runId = data!.id;
  }
  const ctx: Ctx = { sb, runId: runId!, log: (msg) => logs.push({ at: new Date().toISOString(), msg }) };
  const flush = async (patch: Record<string, unknown>) => {
    const { data: run } = await sb.from("collection_runs").select("log").eq("id", runId).single();
    await sb.from("collection_runs").update({ ...patch, log: [...((run?.log as unknown[]) ?? []), ...logs] }).eq("id", runId);
    logs.length = 0;
  };

  try {
    if (action === "caa_lists" || action === "scheduled") {
      const r = await caaLists(ctx);
      const g = await caaRegisters(ctx);
      const summary = `Listes SFCR : ${r.total} entités, ${r.created} nouvelle(s), ${r.removed} disparue(s) · Registres : ${g.total} entités, ${g.created} nouvelle(s), ${g.removed} disparue(s)`;
      if (action === "caa_lists") {
        await flush({ status: "success", finished_at: new Date().toISOString(), summary, progress: r.total, total: r.total });
        return json({ run_id: runId, ...r, registers: g, summary, remaining: 0 });
      }
      ctx.log(summary);
    }

    // Lots : download / history / scheduled
    let ids = (body.entity_ids as string[] | undefined) ?? null;
    if (!ids) {
      const { data } = await sb.from("entities").select("id").eq("is_demo", false).eq("in_caa_list", true)
        .or("caa_pdf_url.not.is.null,caa_page_url.not.is.null").order("name");
      ids = (data ?? []).map((d) => d.id);
    }
    const offset = Number(body.offset ?? 0);
    let i = offset;
    let broken = 0, stored = 0;
    for (; i < ids.length; i++) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const { data: e } = await sb.from("entities").select("id, lei, name, caa_list, caa_pdf_url, caa_page_url").eq("id", ids[i]).single();
      if (!e) continue;
      try {
        if (action === "history") {
          const r = await historyOne(ctx, e);
          stored += r.stored;
          ctx.log(`${e.name} : ${r.stored} SFCR historique(s) ajouté(s)`);
        } else {
          const s = await downloadOne(ctx, e);
          if (s === "broken" || s === "robots") broken++;
          if (s === "stored") stored++;
          ctx.log(`${e.name} : ${s === "stored" ? "SFCR téléchargé" : s === "duplicate" ? "déjà collecté" : s === "unavailable" ? "SFCR non disponible" : s === "robots" ? "interdit par robots.txt" : "lien cassé"}`);
        }
      } catch (err) {
        // Une erreur sur une entité ne bloque jamais les autres
        broken++;
        await alert(ctx, e.id, "broken_link", `${e.name} : ${(err as Error).message}`);
        ctx.log(`${e.name} : erreur ${(err as Error).message}`);
      }
    }
    const remaining = ids.length - i;
    const summary = `${i}/${ids.length} entités traitées · ${stored} PDF ajouté(s) · ${broken} alerte(s)`;
    await flush({
      progress: i, total: ids.length,
      summary,
      ...(remaining === 0 ? { status: broken ? "partial" : "success", finished_at: new Date().toISOString() } : {}),
    });

    // pg_cron n'enchaîne pas les lots : on se relance soi-même tant qu'il reste des entités
    if (remaining > 0 && trigger === "schedule") {
      const secret = req.headers.get("x-cron-secret")!;
      EdgeRuntime.waitUntil(fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify({ action: "download", run_id: runId, entity_ids: ids, offset: i }),
      }).catch(() => {}));
    }
    return json({ run_id: runId, processed: i, total: ids.length, remaining, next_offset: i, entity_ids: remaining ? ids : undefined, stored, broken });
  } catch (err) {
    ctx.log(`Erreur : ${(err as Error).message}`);
    await flush({ status: "error", finished_at: new Date().toISOString(), summary: (err as Error).message });
    return json({ run_id: runId, error: (err as Error).message }, 500);
  }
});
