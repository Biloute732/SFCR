// QRT publiés en annexe séparée (PDF ou Excel) : extraction puis rattachement au SFCR (US4).
import * as XLSX from "xlsx";
import { BUCKET, supabase } from "../supabase";
import { familyOf, isRatioCell, QRT_BY_FAMILY } from "../qrt";
import type { Entity, SfcrDocument } from "../types";
import { runControls } from "./controls";
import { extractQrts, parseNumber, type ExtractedCell, type ExtractedQrt } from "./extractor";
import { readPages } from "./pdfText";
import { sha256 } from "./pipeline";

const QRT_RE = /S\.\s?(\d{2})\.\s?(\d{2})\.\s?(\d{2})/;

/** Classeur Excel : une feuille par QRT, codes R… dans une colonne, codes C… dans une ligne d'en-tête. */
export function extractXlsx(buf: ArrayBuffer): { qrts: ExtractedQrt[]; cells: ExtractedCell[] } {
  const wb = XLSX.read(buf, { type: "array" });
  const qrts: ExtractedQrt[] = [];
  const cells: ExtractedCell[] = [];
  wb.SheetNames.forEach((name, sheetIdx) => {
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], { header: 1, raw: false, defval: null });
    const flat = rows.slice(0, 15).flat().map((v) => String(v ?? "")).join(" ");
    const m = name.match(QRT_RE) ?? flat.match(QRT_RE);
    if (!m) return;
    const family = familyOf(m[0].replace(/\s/g, ""));
    if (!QRT_BY_FAMILY[family]) return;
    let header: { idx: number; code: string }[] = [];
    let rowsRead = 0;
    for (const r of rows) {
      const vals = r.map((v) => String(v ?? "").trim());
      const cols = vals.map((v, idx) => ({ idx, code: v })).filter((c) => /^C\d{4}$/.test(c.code));
      if (cols.length && !vals.some((v) => /^R\d{4}$/.test(v))) { header = cols; continue; }
      const ri = vals.findIndex((v) => /^R\d{4}$/.test(v));
      if (ri < 0 || !header.length) continue;
      rowsRead++;
      const label = vals.slice(0, ri).filter((v) => v && !/^[\d\s.,-]+$/.test(v)).join(" ") || null;
      for (const h of header) {
        const raw = vals[h.idx] ?? "";
        const ratio = isRatioCell(family, vals[ri], h.code);
        const p = parseNumber(raw, ratio);
        let v = p.value;
        if ((ratio || p.pct) && v != null && !p.pct && Math.abs(v) <= 20) v *= 100;
        cells.push({ family, row: vals[ri], col: h.code, rowLabel: label, rawText: raw, rawValue: v, isBlank: p.blank, isRatio: ratio || p.pct, pages: [sheetIdx + 1] });
      }
    }
    if (rowsRead) qrts.push({ family, fullCode: m[0].replace(/\s/g, ""), pages: [sheetIdx + 1], matchedBy: "code", needsReview: false });
  });
  return { qrts, cells };
}

/** Joint une annexe à un SFCR et ajoute ses cellules (celles déjà lues dans le SFCR sont conservées). */
export async function attachAnnex(doc: SfcrDocument, file: File, entity: Entity | null) {
  const buf = await file.arrayBuffer();
  const isXlsx = /\.xlsx?$/i.test(file.name);
  const hash = await sha256(buf);
  const path = `annex/${doc.id}/${hash.slice(0, 16)}${isXlsx ? ".xlsx" : ".pdf"}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
  if (up.error) throw new Error(up.error.message);
  const { data: att, error } = await supabase.from("sfcr_attachments")
    .insert({ document_id: doc.id, storage_path: path, file_name: file.name, kind: isXlsx ? "xlsx" : "pdf" }).select("id").single();
  if (error) throw new Error(error.message);

  const res = isXlsx ? extractXlsx(buf) : extractQrts((await readPages(buf)).pages, entity?.level ?? "Solo");
  const { data: existing } = await supabase.from("qrt_cells").select("qrt_code,row_code,col_code,is_blank").eq("document_id", doc.id);
  const have = new Set((existing ?? []).filter((c) => !c.is_blank).map((c) => `${c.qrt_code}|${c.row_code}|${c.col_code}`));
  const fresh = res.cells.filter((c) => !have.has(`${c.family}|${c.row}|${c.col}`));
  // Remplace les cellules vides éventuellement lues dans le SFCR
  for (const c of fresh) {
    await supabase.from("qrt_cells").delete().eq("document_id", doc.id).eq("qrt_code", c.family).eq("row_code", c.row).eq("col_code", c.col);
  }
  for (let i = 0; i < fresh.length; i += 500) {
    const { error: e } = await supabase.from("qrt_cells").insert(fresh.slice(i, i + 500).map((c) => ({
      document_id: doc.id, qrt_code: c.family, row_code: c.row, col_code: c.col, row_label: c.rowLabel, raw_text: c.rawText,
      raw_value: c.rawValue, is_blank: c.isBlank, is_ratio: c.isRatio, pages: c.pages, check_status: "ok", extracted_value: c.rawValue,
    })));
    if (e) throw new Error(e.message);
  }
  for (const q of res.qrts) {
    await supabase.from("qrt_instances").upsert({
      document_id: doc.id, qrt_code: q.family, full_code: q.fullCode, status: "found", pages: q.pages, matched_by: q.matchedBy,
      needs_review: q.needsReview, attachment_id: att.id,
    }, { onConflict: "document_id,qrt_code" });
  }
  await rerunControls(doc.id, entity);
  return { qrts: res.qrts.length, cells: fresh.length };
}

/** Relance les contrôles d'un document à partir des cellules en base (après annexe ou ré-extraction). */
export async function rerunControls(docId: string, entity: Entity | null) {
  const { data: d } = await supabase.from("sfcr_documents").select("*").eq("id", docId).single();
  const { data: cells } = await supabase.from("qrt_cells").select("id,qrt_code,row_code,col_code,raw_value,value_keur,is_blank,is_ratio,check_status").eq("document_id", docId);
  if (!d || !cells) return;
  const factor = Number(d.unit_factor ?? 1);
  const ctl = runControls(cells.map((c) => ({
    family: c.qrt_code, row: c.row_code, col: c.col_code, isBlank: c.is_blank, isRatio: c.is_ratio,
    value: c.value_keur != null ? Number(c.value_keur) : c.raw_value == null ? null : c.is_ratio ? Number(c.raw_value) : Number(c.raw_value) * factor,
  })), { level: entity?.level ?? "Solo", caaRatio: null, previous: null });
  const idOf = new Map(cells.map((c) => [`${c.qrt_code}|${c.row_code}|${c.col_code}`, c]));
  await supabase.from("control_results").delete().eq("document_id", docId).neq("control_code", "ratio_caa").neq("control_code", "yoy_unit");
  await supabase.from("control_results").insert(ctl.map((c) => ({
    document_id: docId, control_code: c.code, label: c.label, status: c.status, expected: c.expected, actual: c.actual,
    tolerance: c.tolerance, message: c.message, cell_ids: c.cellKeys.map((k) => idOf.get(k)?.id).filter(Boolean),
  })));
  const failed = ctl.filter((c) => c.status === "failed").flatMap((c) => c.cellKeys).map((k) => idOf.get(k)).filter((c) => c && c.check_status === "ok").map((c) => c!.id);
  if (failed.length) await supabase.from("qrt_cells").update({ check_status: "failed" }).in("id", failed);
  if (d.unit_validated_at) await supabase.rpc("validate_unit", { p_document_id: docId, p_unit_factor: d.unit_factor, p_currency: d.currency, p_fx_rate: d.fx_rate });
  else await supabase.rpc("refresh_document_status", { p_document_id: docId });
}
