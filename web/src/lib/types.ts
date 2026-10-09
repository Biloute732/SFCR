export type Level = "Solo" | "Groupe";
export type EntityType = "Vie" | "Non-Vie" | "Mixte";
export type Branch = "all" | "Vie" | "Non-Vie";

export interface Entity {
  id: string;
  lei: string;
  name: string;
  level: Level;
  type: EntityType;
  caa_list: string | null;
  caa_ratio: number | null;
  caa_pdf_url: string | null;
  caa_page_url: string | null;
  caa_contact: string | null;
  successor_id: string | null;
  group_method: number | null;
  list_change: "new" | "removed" | null;
  in_caa_list: boolean;
  /** caa_sfcr : listes SFCR du CAA ; caa_register : registres des entreprises agréées ; manual : ajout manuel */
  source: "caa_sfcr" | "caa_register" | "manual";
  category: "assurance" | "reassurance" | "captive";
  country: string;
  manager: string | null;
  address: string | null;
  is_demo: boolean;
}

export type YearStatus =
  | "validated" | "review" | "collecting" | "error" | "not_applicable" | "not_found" | "unavailable" | "pending";

export interface EntityYear {
  entity_id: string;
  reference_year: number;
  document_id: string | null;
  doc_status: string | null;
  origin: string | null;
  source_url: string | null;
  collected_at: string | null;
  version: number | null;
  flag: string | null;
  year_status: YearStatus;
}

export interface SfcrDocument {
  id: string;
  entity_id: string | null;
  reference_year: number | null;
  version: number;
  is_current: boolean;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  source_url: string | null;
  origin: "caa" | "site" | "import" | "archive";
  collected_at: string;
  status: "to_extract" | "extracting" | "unit_pending" | "review" | "validated" | "error";
  error: string | null;
  unit_label: string | null;
  unit_factor: number | null;
  currency: string | null;
  fx_rate: number | null;
  fx_date: string | null;
  unit_evidence: string | null;
  unit_evidence_page: number | null;
  unit_detected_explicitly: boolean;
  unit_validated_at: string | null;
  year_evidence: string | null;
  year_evidence_page: number | null;
  year_confirmed: boolean;
  entity_match_confidence: "lei" | "name" | "manual" | "uncertain" | null;
  is_scanned: boolean;
  page_count: number | null;
  extracted_at: string | null;
  detected_lei: string | null;
  candidate_year: number | null;
  is_demo: boolean;
}

export interface QrtCell {
  id: string;
  document_id: string;
  qrt_code: string;
  row_code: string;
  col_code: string;
  row_label: string | null;
  raw_text: string | null;
  raw_value: number | null;
  is_blank: boolean;
  is_ratio: boolean;
  factor: number | null;
  value_keur: number | null;
  pages: number[];
  check_status: "ok" | "failed" | "corrected";
  extracted_value: number | null;
}

/** Cellule validée, enrichie de son document (vue validated_cells). */
export interface VCell extends QrtCell {
  entity_id: string;
  reference_year: number;
  source_url: string | null;
  origin: string;
  collected_at: string;
  storage_path: string | null;
}

export interface QrtInstance {
  id: string;
  document_id: string;
  qrt_code: string;
  full_code: string | null;
  status: "found" | "missing" | "not_applicable";
  pages: number[];
  matched_by: "code" | "label" | null;
  needs_review: boolean;
  unit_factor_override: number | null;
}
