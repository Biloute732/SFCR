import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useAsync } from "../lib/data";
import { supabase } from "../lib/supabase";
import { fmtAmount, fmtPct } from "../lib/format";
import { QRT_BY_FAMILY, ROW_LABELS } from "../lib/qrt";
import type { Entity, QrtCell, QrtInstance, SfcrDocument } from "../lib/types";
import { ErrorNote, Legal, Loading, PageHead, Seg } from "../components/ui";
import { useOpenPdf } from "../components/Trace";

export default function QrtDetail() {
  const { id, qrt } = useParams();
  const [params, setParams] = useSearchParams();
  const { settings, years: YEARS, latestYear } = useApp();
  const year = Number(params.get("annee")) || latestYear;
  const openPdf = useOpenPdf();
  const [show, setShow] = useState<"both" | "norm" | "raw">("both");

  const { data, error, loading } = useAsync(async () => {
    const [{ data: e }, { data: d }] = await Promise.all([
      supabase.from("entities").select("*").eq("id", id!).single(),
      supabase.from("sfcr_documents").select("*").eq("entity_id", id!).eq("reference_year", year).eq("is_current", true).maybeSingle(),
    ]);
    if (!d) return { entity: e as Entity, doc: null, cells: [] as QrtCell[], inst: null };
    const [{ data: cells }, { data: inst }] = await Promise.all([
      supabase.from("qrt_cells").select("*").eq("document_id", d.id).eq("qrt_code", qrt!).limit(5000),
      supabase.from("qrt_instances").select("*").eq("document_id", d.id).eq("qrt_code", qrt!).maybeSingle(),
    ]);
    return { entity: e as Entity, doc: d as SfcrDocument, cells: (cells ?? []) as QrtCell[], inst: inst as QrtInstance | null };
  }, [id, qrt, year]);

  const grid = useMemo(() => {
    const cells = data?.cells ?? [];
    const rows = [...new Set(cells.map((c) => c.row_code))].sort();
    const cols = [...new Set(cells.map((c) => c.col_code))].sort();
    const m = new Map(cells.map((c) => [`${c.row_code}|${c.col_code}`, c]));
    const labels = new Map<string, string>();
    for (const c of cells) if (c.row_label && !labels.has(c.row_code)) labels.set(c.row_code, c.row_label);
    return { rows, cols, m, labels };
  }, [data]);

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;
  const def = QRT_BY_FAMILY[qrt!];
  const validated = !!data?.doc?.unit_validated_at;

  return (
    <main className="page">
      <PageHead
        kicker={<Link to={`/compagnies/${id}?annee=${year}`}>{data?.entity?.name ?? "Compagnie"}</Link>}
        title={<><span className="mono" style={{ fontSize: 32 }}>{data?.inst?.full_code ?? qrt}</span> {def?.title ?? ""}</>}
        intro={<>
          {def?.titleFr} · exercice {year} · {validated ? `valeurs normalisées en ${settings.display_unit} (facteur ${data?.doc?.unit_factor}${data?.doc?.currency !== "EUR" ? `, ${data?.doc?.currency} au cours BCE ${data?.doc?.fx_rate}` : ""})` : "unité non validée : seules les valeurs brutes sont affichées"}
          {data?.inst?.pages?.length ? <> · pages {data.inst.pages.join(", ")}</> : null}
          {data?.inst?.matched_by === "label" && <> · rapproché par libellé (sans codes R/C)</>}
        </>}
        actions={<>
          <Seg name="year" value={String(year)} onChange={(v) => setParams({ annee: v })} options={YEARS.map((y) => [String(y), String(y)] as [string, string])} />
          <Seg name="show" value={show} onChange={setShow} options={[["both", "Normalisée + brute"], ["norm", "Normalisée"], ["raw", "Brute"]]} />
        </>}
      />
      {!data?.doc ? <p className="muted" style={{ padding: "var(--space-6) 0" }}>Pas de SFCR courant pour {year}.</p> : (
        <section className="table-wrap" style={{ paddingTop: "var(--space-4)" }}>
          <table className="table qrt-table" style={{ minWidth: 300 + grid.cols.length * 130 }}>
            <thead>
              <tr><th>Ligne</th>{grid.cols.map((c) => <th key={c} className="num mono">{c}</th>)}</tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <tr key={r}>
                  <td style={{ maxWidth: 320 }}>
                    <span className="mono small">{r}</span>{" "}
                    <span className="small">{grid.labels.get(r) ?? ROW_LABELS[`${qrt}|${r}`] ?? ""}</span>
                  </td>
                  {grid.cols.map((c) => {
                    const cell = grid.m.get(`${r}|${c}`);
                    if (!cell) return <td key={c} />;
                    const cls = cell.check_status === "failed" ? "cell-failed" : cell.check_status === "corrected" ? "cell-corrected" : "";
                    const norm = cell.is_blank ? "—" : !validated ? null : cell.is_ratio ? fmtPct(cell.value_keur, 2) : fmtAmount(cell.value_keur == null ? null : Number(cell.value_keur), settings.display_unit);
                    return (
                      <td key={c} className={`num ${cls}`} title={`${qrt} ${r} ${c} · brut « ${cell.raw_text ?? ""} » · facteur ${cell.factor ?? "—"} · p. ${cell.pages.join(", ")}${cell.check_status === "failed" ? " · en échec de contrôle" : cell.check_status === "corrected" ? " · corrigée" : ""}`}>
                        <button className="trace" onClick={() => openPdf(data.doc!.storage_path, cell.pages[0])}>
                          {show !== "raw" && (norm ?? <span className="pending-val small">En revue</span>)}
                          {show === "both" && <div className="sub">{cell.raw_text || "vide"}</div>}
                          {show === "raw" && (cell.raw_text || "vide")}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!grid.rows.length && <p className="muted">Aucune cellule extraite pour ce QRT.</p>}
          <p className="small muted">Fond rouge clair : cellule en échec de contrôle. Filet gauche : cellule corrigée (voir le journal dans la file de revue). Un clic ouvre le PDF à la page de la cellule.</p>
          <Legal />
        </section>
      )}
    </main>
  );
}
