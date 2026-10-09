// Chaîne d'extraction d'un SFCR stocké : lecture → QRT → normalisation proposée → contrôles → base.
// Tourne dans le navigateur (pdf.js) : le PDF ne quitte pas l'infrastructure Supabase.
import { BUCKET, supabase } from "../supabase";
import { expectedQrts, fullCode, QRT_ALTERNATIVES, SCR_FAMILIES } from "../qrt";
import type { Entity, SfcrDocument } from "../types";
import { runControls, type CtlCell } from "./controls";
import { EXTRACTOR_VERSION, extractQrts, type ExtractionResult } from "./extractor";
import { readPages, type PageText } from "./pdfText";

export type Progress = (msg: string, done?: number, total?: number) => void;

const normName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(s\.?a\.?|se|sa|s\.a\.r\.l\.?|ltd|limited|europe|luxembourg)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Rattache un document à une entité : LEI lu dans le document, sinon nom ; sinon incertain. */
export function matchEntity(pages: PageText[], leis: string[], entities: Entity[], assigned: Entity | null) {
  const head = pages.slice(0, 6).map((p) => p.text).join("\n");
  const headNorm = normName(head);
  if (assigned) {
    if (!assigned.lei.startsWith("NOLEI:") && leis.includes(assigned.lei)) return { entity: assigned, confidence: "lei" as const };
    if (headNorm.includes(normName(assigned.name))) return { entity: assigned, confidence: "name" as const };
  }
  const byLei = entities.filter((e) => !e.lei.startsWith("NOLEI:") && head.includes(e.lei));
  if (byLei.length === 1) return { entity: byLei[0], confidence: "lei" as const };
  const byName = entities.filter((e) => normName(e.name).length > 3 && headNorm.includes(normName(e.name)));
  // Le nom le plus long l'emporte (« Foyer Vie » plutôt que « Foyer »)
  byName.sort((a, b) => normName(b.name).length - normName(a.name).length);
  if (byName.length === 1 || (byName.length > 1 && normName(byName[0].name).length > normName(byName[1].name).length + 3)) {
    return { entity: byName[0], confidence: "name" as const };
  }
  return { entity: assigned, confidence: "uncertain" as const };
}

async function insertChunks(table: string, rows: Record<string, unknown>[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table} : ${error.message}`);
  }
}

export async function extractDocument(doc: SfcrDocument, entities: Entity[], onProgress: Progress = () => {}) {
  if (!doc.storage_path) throw new Error("Document sans fichier stocké");
  await supabase.from("sfcr_documents").update({ status: "extracting", error: null }).eq("id", doc.id);
  try {
    onProgress("Téléchargement du PDF");
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
    if (error || !blob) throw new Error(error?.message ?? "PDF introuvable dans le stockage");
    const buf = await blob.arrayBuffer();

    const { pages, scanned } = await readPages(buf, (d, t, label) => onProgress(label, d, t));
    const assigned = entities.find((e) => e.id === doc.entity_id) ?? null;
    onProgress("Repérage des QRT");
    const res = extractQrts(pages, assigned?.level ?? "Solo");
    const match = matchEntity(pages, res.leis, entities, assigned);
    const entity = match.entity;
    const year = res.year?.year ?? doc.candidate_year ?? null;
    const yearUncertain = !res.year || (doc.candidate_year != null && res.year.year !== doc.candidate_year);

    await saveExtraction(doc, entity, res, {
      scanned, pageCount: pages.length, year, yearUncertain, confidence: match.confidence, onProgress,
    });
    return { entity, year, res };
  } catch (e) {
    await supabase.from("sfcr_documents").update({ status: "error", error: (e as Error).message }).eq("id", doc.id);
    throw e;
  }
}

async function saveExtraction(
  doc: SfcrDocument, entity: Entity | null, res: ExtractionResult,
  o: { scanned: boolean; pageCount: number; year: number | null; yearUncertain: boolean; confidence: "lei" | "name" | "uncertain"; onProgress: Progress },
) {
  const level = entity?.level ?? "Solo";
  o.onProgress("Enregistrement des QRT");

  // Ré-extraction : on repart d'une ardoise propre (les corrections déjà tracées restent dans le journal)
  await supabase.from("control_results").delete().eq("document_id", doc.id);
  await supabase.from("group_members").delete().eq("document_id", doc.id);
  await supabase.from("qrt_cells").delete().eq("document_id", doc.id);
  await supabase.from("qrt_instances").delete().eq("document_id", doc.id);

  // QRT trouvés + attendus manquants / non applicables
  const found = new Map(res.qrts.map((q) => [q.family, q]));
  const instances: Record<string, unknown>[] = res.qrts.map((q) => ({
    document_id: doc.id, qrt_code: q.family, full_code: q.fullCode, status: "found", pages: q.pages,
    matched_by: q.matchedBy, needs_review: q.needsReview || o.scanned,
    unit_factor_override: res.qrtUnitOverrides[q.family] ?? null,
  }));
  const missing: string[] = [];
  if (entity) {
    const method2 = entity.level === "Groupe" && (entity.group_method === 2 || (res.mentionsMethod2 && !found.has("S.02.01") && !SCR_FAMILIES.some((f) => found.has(f))));
    for (const ex of expectedQrts(entity.level, entity.type, method2 ? 2 : entity.group_method)) {
      if ((QRT_ALTERNATIVES[ex.family] ?? [ex.family]).some((f) => found.has(f))) continue;
      const status = ex.need === "required" ? "missing" : "not_applicable";
      instances.push({ document_id: doc.id, qrt_code: ex.family, full_code: fullCode(ex.family, entity.level), status, pages: [], matched_by: null, needs_review: false, unit_factor_override: null });
      if (status === "missing") missing.push(ex.family);
    }
    // SCR : S.25.01 ou S.25.05 ; MCR solo : S.28.01 ou S.28.02
    const alt: [string[], boolean][] = [[SCR_FAMILIES, !(method2)], [["S.28.01", "S.28.02"], entity.level === "Solo"]];
    for (const [fams, needed] of alt) {
      if (needed && !fams.some((f) => found.has(f))) {
        instances.push({ document_id: doc.id, qrt_code: fams[0], full_code: fullCode(fams[0], entity.level), status: "missing", pages: [], matched_by: null, needs_review: false, unit_factor_override: null });
        missing.push(fams.join(" / "));
      }
    }
    if (method2) {
      for (const f of ["S.02.01", "S.25.01"]) if (!found.has(f)) instances.push({ document_id: doc.id, qrt_code: f, full_code: fullCode(f, "Groupe"), status: "not_applicable", pages: [], matched_by: null, needs_review: false, unit_factor_override: null });
    }
  }
  // dédoublonnage (un QRT attendu peut avoir été ajouté deux fois)
  const seen = new Set<string>();
  await insertChunks("qrt_instances", instances.filter((i) => !seen.has(i.qrt_code as string) && seen.add(i.qrt_code as string)));

  // Contrôles avec le facteur proposé (l'unité sera validée par l'utilisateur)
  o.onProgress("Contrôles de cohérence");
  const factorFor = (fam: string) => res.qrtUnitOverrides[fam] ?? res.unit.factor;
  const ctlCells: CtlCell[] = res.cells.map((c) => ({
    family: c.family, row: c.row, col: c.col, isBlank: c.isBlank, isRatio: c.isRatio,
    value: c.rawValue == null ? null : c.isRatio ? c.rawValue : c.rawValue * factorFor(c.family),
  }));
  let previous: Map<string, number> | null = null;
  if (entity && o.year) {
    const { data: prev } = await supabase.from("validated_cells").select("qrt_code,row_code,col_code,value_keur")
      .eq("entity_id", entity.id).eq("reference_year", o.year - 1).not("value_keur", "is", null);
    if (prev?.length) previous = new Map(prev.map((p) => [`${p.qrt_code}|${p.row_code}|${p.col_code}`, Number(p.value_keur)]));
  }
  // Le CAA affiche le ratio du dernier exercice : comparaison seulement pour cette année-là
  const latestYear = new Date().getMonth() >= 3 ? new Date().getFullYear() - 1 : new Date().getFullYear() - 2;
  const controls = runControls(ctlCells, {
    level, previous,
    caaRatio: entity && o.year === latestYear && entity.level === "Solo" ? entity.caa_ratio : null,
  });
  const failedKeys = new Set(controls.filter((c) => c.status === "failed").flatMap((c) => c.cellKeys));
  const reviewFamilies = new Set(res.qrts.filter((q) => q.needsReview || o.scanned).map((q) => q.family));

  // Cellules
  o.onProgress("Enregistrement des cellules", 0, res.cells.length);
  const cellRows = res.cells.map((c) => {
    const key = `${c.family}|${c.row}|${c.col}`;
    const failed = failedKeys.has(key) || (reviewFamilies.has(c.family) && !c.isBlank);
    return {
      document_id: doc.id, qrt_code: c.family, row_code: c.row, col_code: c.col, row_label: c.rowLabel,
      raw_text: c.rawText, raw_value: c.rawValue, is_blank: c.isBlank, is_ratio: c.isRatio,
      factor: null, value_keur: null, pages: c.pages, check_status: failed ? "failed" : "ok", extracted_value: c.rawValue,
    };
  });
  await insertChunks("qrt_cells", cellRows);

  // Rattachement des contrôles aux identifiants de cellules
  const { data: ids } = await supabase.from("qrt_cells").select("id,qrt_code,row_code,col_code").eq("document_id", doc.id);
  const idOf = new Map((ids ?? []).map((r) => [`${r.qrt_code}|${r.row_code}|${r.col_code}`, r.id as string]));
  await insertChunks("control_results", controls.map((c) => ({
    document_id: doc.id, control_code: c.code, label: c.label, status: c.status, expected: c.expected, actual: c.actual,
    tolerance: c.tolerance, message: c.message, cell_ids: c.cellKeys.map((k) => idOf.get(k)).filter(Boolean),
  })));

  if (res.groupMembers.length) {
    await insertChunks("group_members", res.groupMembers.map((g) => ({ document_id: doc.id, member_lei: g.lei, member_name: g.name, country: g.country, page: g.page })));
  }

  // Entité Mixte : une entité solo qui remplit S.28.02.01
  if (entity && entity.level === "Solo" && found.has("S.28.02") && entity.type !== "Mixte") {
    await supabase.from("entities").update({ type: "Mixte" }).eq("id", entity.id);
  }
  if (entity && missing.length) {
    await supabase.from("alerts").insert({ entity_id: entity.id, kind: "missing_qrt", message: `${entity.name} ${o.year ?? ""} : QRT manquant(s) ${missing.join(", ")}`, url: doc.source_url });
  }
  if (o.scanned && entity) {
    await supabase.from("alerts").insert({ entity_id: entity.id, kind: "scanned", message: `${entity.name} ${o.year ?? ""} : PDF scanné, reconnaissance de texte appliquée, SFCR entier en revue`, url: doc.source_url });
  }

  const uncertain = o.confidence === "uncertain" || !entity || !o.year || o.yearUncertain;
  const { error: upErr } = await supabase.from("sfcr_documents").update({
    entity_id: entity?.id ?? null,
    reference_year: uncertain ? null : o.year,
    candidate_year: o.year,
    year_evidence: res.year?.evidence ?? null, year_evidence_page: res.year?.page ?? null,
    year_confirmed: !uncertain,
    entity_match_confidence: o.confidence,
    detected_lei: res.leis.find((l) => l === entity?.lei) ?? res.leis[0] ?? null,
    unit_label: res.unit.label, unit_factor: res.unit.factor, currency: res.unit.currency,
    unit_evidence: res.unit.evidence, unit_evidence_page: res.unit.page, unit_detected_explicitly: res.unit.explicit,
    unit_validated_at: null,
    is_scanned: o.scanned, page_count: o.pageCount, extracted_at: new Date().toISOString(),
    extractor_version: EXTRACTOR_VERSION, extraction_log: res.log, status: "unit_pending",
  }).eq("id", doc.id);
  if (upErr) throw new Error(upErr.message);
  if (!uncertain) {
    // Nouvelle version pour la même année : la plus récente devient la version de référence
    const { error: e2 } = await supabase.rpc("set_document_current", { p_document_id: doc.id });
    if (e2) throw new Error(e2.message);
  }
}

/** Confirmation d'un rattachement incertain (écran Import en lot). */
export async function confirmAttachment(docId: string, entityId: string, year: number) {
  const { error } = await supabase.from("sfcr_documents").update({
    entity_id: entityId, reference_year: year, candidate_year: year, year_confirmed: true, entity_match_confidence: "manual",
  }).eq("id", docId);
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.rpc("set_document_current", { p_document_id: docId });
  if (e2) throw new Error(e2.message);
  await supabase.rpc("refresh_document_status", { p_document_id: docId });
}

/** Empreinte SHA-256 d'un fichier (doublons d'import). */
export async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Dépôt d'un PDF importé : stockage + document « à extraire ». */
export async function uploadImport(file: File) {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const { data: dup } = await supabase.from("sfcr_documents").select("id").eq("file_hash", hash).maybeSingle();
  if (dup) return { status: "duplicate" as const, id: dup.id as string };
  const path = `import/${hash.slice(0, 2)}/${hash.slice(0, 16)}.pdf`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await supabase.from("sfcr_documents").insert({
    storage_path: path, file_name: file.name, file_hash: hash, file_size: file.size, origin: "import",
    source_url: null, status: "to_extract", is_current: false,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return { status: "stored" as const, id: data.id as string, doc: data as SfcrDocument };
}
