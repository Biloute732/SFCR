import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { fetchAll, loadEntities, useAsync } from "../lib/data";
import { callCollect, pdfUrl, supabase } from "../lib/supabase";
import { fmtAmount, fmtDateTime, fmtPct, ORIGIN_LABEL } from "../lib/format";
import { attachAnnex } from "../lib/extract/annex";
import type { Entity, QrtCell, QrtInstance, SfcrDocument } from "../lib/types";
import { ErrorNote, Legal, Loading, PageHead, Seg } from "../components/ui";

interface Control { id: string; control_code: string; label: string; status: string; expected: number | null; actual: number | null; tolerance: string | null; message: string | null; cell_ids: string[]; resolved_at: string | null }
interface Correction { id: string; cell_id: string; corrected_at: string; value_before: number | null; value_after: number | null; action: string; reason: string }

const UNIT_OPTS: [string, string, number][] = [["units", "Euros (unités)", 0.001], ["thousands", "Milliers", 1], ["millions", "Millions", 1000]];

export default function Review() {
  const { docId } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [entities, docs, qis] = await Promise.all([
      loadEntities(),
      fetchAll<SfcrDocument>((a, b) => supabase.from("sfcr_documents").select("*").in("status", ["unit_pending", "review"]).order("collected_at").range(a, b)),
      fetchAll<{ document_id: string; status: string; needs_review: boolean }>((a, b) => supabase.from("qrt_instances").select("document_id,status,needs_review").eq("status", "found").range(a, b)),
    ]);
    const failed = await fetchAll<{ document_id: string; qrt_code: string }>((a, b) => supabase.from("qrt_cells").select("document_id,qrt_code").eq("check_status", "failed").range(a, b));
    return { entities, docs, qis, failed };
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const failedQrts = new Set(data.failed.map((f) => `${f.document_id}|${f.qrt_code}`));
    const total = data.qis.length;
    const inReview = data.qis.filter((q) => q.needs_review).length + failedQrts.size;
    return { total, inReview, pct: total ? (Math.min(inReview, total) / total) * 100 : 0, failedByDoc: data.failed.reduce((m, f) => m.set(f.document_id, (m.get(f.document_id) ?? 0) + 1), new Map<string, number>()) };
  }, [data]);

  useEffect(() => {
    if (!docId && data?.docs.length) nav(`/revue/${data.docs[0].id}`, { replace: true });
  }, [docId, data, nav]);

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;
  const name = (d: SfcrDocument) => data!.entities.find((e) => e.id === d.entity_id)?.name ?? d.file_name ?? "Document non rattaché";

  return (
    <main className="page">
      <PageHead kicker="Données" title="File de revue"
        intro="Validation de l'unité et de la devise une fois par SFCR, puis correction des seules cellules en échec de contrôle, PDF à côté. Chaque correction est tracée avec son motif." />
      <section className="stats">
        <div className="stat static"><span className="v">{data!.docs.filter((d) => d.status === "unit_pending").length}</span><span className="l">Unités à valider</span></div>
        <div className="stat static"><span className="v">{data!.docs.filter((d) => d.status === "review").length}</span><span className="l">SFCR avec cellules en échec</span></div>
        <div className="stat static"><span className="v">{data!.failed.length}</span><span className="l">Cellules en échec</span></div>
        <div className="stat static"><span className="v" style={{ color: stats!.pct > 10 ? "var(--color-accent-700)" : undefined }}>{fmtPct(stats!.pct, 1)}</span><span className="l">QRT en revue (cible ≤ 10 % ; au-delà, l'extracteur est à corriger)</span></div>
      </section>
      <div className="split" style={{ gridTemplateColumns: "minmax(260px, 340px) minmax(0, 1fr)" }}>
        <aside style={{ paddingTop: "var(--space-4)" }}>
          <table className="table">
            <tbody>
              {data!.docs.map((d) => (
                <tr key={d.id} className={`clickable${d.id === docId ? " sel" : ""}`} onClick={() => nav(`/revue/${d.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{name(d)}</div>
                    <div className="sub">{d.reference_year ?? `${d.candidate_year ?? "?"} (à confirmer)`} · {ORIGIN_LABEL[d.origin]}{d.is_scanned ? " · scanné" : ""}</div>
                  </td>
                  <td className="num">{d.status === "unit_pending" ? <span className="tag tag-outline">Unité</span> : <span className="tag tag-accent">{stats!.failedByDoc.get(d.id) ?? 0}</span>}</td>
                </tr>
              ))}
              {!data!.docs.length && <tr><td className="muted">Rien à revoir. Les SFCR extraits apparaissent ici.</td></tr>}
            </tbody>
          </table>
        </aside>
        <div style={{ paddingTop: "var(--space-4)" }}>
          {docId ? <DocReview key={docId} docId={docId} entities={data!.entities} onChanged={reload} /> : <p className="muted">Sélectionnez un SFCR.</p>}
        </div>
      </div>
      <Legal />
    </main>
  );
}

function PdfPane({ path, page }: { path: string | null; page: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (path) pdfUrl(path, page ?? 1).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => { alive = false; };
  }, [path, page]);
  if (!path) return <div className="pdf-frame" style={{ display: "grid", placeItems: "center" }}><span className="muted">PDF non disponible (donnée de démonstration).</span></div>;
  return url ? <iframe key={url} className="pdf-frame" src={url} title="PDF source" /> : <div className="pdf-frame" />;
}

function DocReview({ docId, entities, onChanged }: { docId: string; entities: Entity[]; onChanged: () => void }) {
  const { toast, settings } = useApp();
  const { data, error, loading, reload } = useAsync(async () => {
    const [{ data: doc }, { data: controls }, cells, { data: corr }, { data: qis }] = await Promise.all([
      supabase.from("sfcr_documents").select("*").eq("id", docId).single(),
      supabase.from("control_results").select("*").eq("document_id", docId).order("status"),
      fetchAll<QrtCell>((a, b) => supabase.from("qrt_cells").select("*").eq("document_id", docId).in("check_status", ["failed", "corrected"]).range(a, b)),
      supabase.from("corrections").select("*").eq("document_id", docId).order("corrected_at", { ascending: false }),
      supabase.from("qrt_instances").select("*").eq("document_id", docId).order("qrt_code"),
    ]);
    return { doc: doc as SfcrDocument, controls: (controls ?? []) as Control[], cells, corrections: (corr ?? []) as Correction[], qis: (qis ?? []) as QrtInstance[] };
  }, [docId]);
  const [page, setPage] = useState<number | null>(null);
  const refresh = () => { void reload(); onChanged(); };

  if (loading && !data) return <Loading />;
  if (error || !data?.doc) return <ErrorNote error={error ?? "Document introuvable"} />;
  const d = data.doc;
  const entity = entities.find((e) => e.id === d.entity_id);
  const pdfPage = page ?? d.unit_evidence_page ?? 1;
  const failed = data.cells.filter((c) => c.check_status === "failed");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
        <div>
          <h3 style={{ margin: 0 }}>{entity ? <Link to={`/compagnies/${entity.id}`} style={{ color: "var(--color-text)" }}>{entity.name}</Link> : d.file_name}</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Exercice {d.reference_year ?? "à confirmer"} · v{d.version} · {ORIGIN_LABEL[d.origin]} · collecté le {fmtDateTime(d.collected_at)} · {d.page_count ?? "?"} pages
            {d.source_url && <> · <a href={d.source_url} target="_blank" rel="noreferrer">URL source</a></>}
          </p>
          {d.year_evidence && <p className="small muted" style={{ margin: 0 }}>Année lue : « {d.year_evidence} » <button className="btn btn-ghost" style={{ padding: 0 }} onClick={() => setPage(d.year_evidence_page)}>p. {d.year_evidence_page}</button></p>}
          {d.is_scanned && <p className="note" style={{ marginTop: "var(--space-2)" }}>PDF scanné : texte obtenu par reconnaissance optique, toutes les cellules sont en revue.</p>}
        </div>

        {(!entity || !d.reference_year) && (
          <p className="note">Rattachement incertain (entité ou année). Confirmez-le dans <Link to="/import">Import en lot</Link> avant de valider l'unité.</p>
        )}

        {!d.unit_validated_at ? (
          <UnitPanel d={d} onEvidence={() => setPage(d.unit_evidence_page)} onDone={() => { toast("Unité validée."); refresh(); }} disabled={!entity || !d.reference_year} />
        ) : (
          <div className="panel small">
            Unité validée le {fmtDateTime(d.unit_validated_at)} : facteur ×{d.unit_factor} vers kEUR{d.currency !== "EUR" ? `, ${d.currency} converti au cours BCE ${d.fx_rate} du ${d.fx_date ?? `31/12/${d.reference_year}`}` : ", EUR"}.
            {" "}<ResetUnit docId={d.id} onDone={refresh} />
          </div>
        )}

        <section>
          <h4 style={{ margin: "0 0 var(--space-2)" }}>Contrôles de cohérence</h4>
          <table className="table" style={{ fontSize: 13 }}>
            <tbody>
              {data.controls.map((c) => (
                <tr key={c.id}>
                  <td>{c.status === "passed" ? <span className="tag tag-neutral">OK</span> : c.status === "failed" ? <span className={c.resolved_at ? "tag tag-neutral" : "tag tag-accent"}>{c.resolved_at ? "Résolu" : "Échec"}</span> : <span className="tag tag-plain">Non testé</span>}</td>
                  <td>{c.label}<div className="sub">{c.tolerance}{c.message ? ` · ${c.message}` : ""}{c.expected != null && c.actual != null ? ` · attendu ${fmtAmount(c.expected)} / lu ${fmtAmount(c.actual)}` : ""}</div></td>
                </tr>
              ))}
              {!data.controls.length && <tr><td className="muted">Aucun contrôle exécuté.</td></tr>}
            </tbody>
          </table>
        </section>

        <section>
          <h4 style={{ margin: "0 0 var(--space-2)" }}>Cellules en échec <span className="muted small">{failed.length}</span></h4>
          {!d.unit_validated_at && failed.length > 0 && <p className="small muted">Validez d'abord l'unité : les valeurs normalisées s'affichent ensuite.</p>}
          {failed.length > 0 && d.unit_validated_at && <BulkConfirm cells={failed} onDone={refresh} />}
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Cellule</th><th className="num">Extrait</th><th>Correction (kEUR ou %)</th></tr></thead>
            <tbody>
              {failed.slice(0, 200).map((c) => <CellRow key={c.id} c={c} validated={!!d.unit_validated_at} onFocus={() => setPage(c.pages[0])} onDone={refresh} />)}
              {!failed.length && <tr><td colSpan={3} className="muted">Aucune cellule en échec.</td></tr>}
            </tbody>
          </table>
          {failed.length > 200 && <p className="small muted">200 premières cellules affichées ; confirmez par QRT pour traiter le reste.</p>}
        </section>

        <section>
          <h4 style={{ margin: "0 0 var(--space-2)" }}>QRT</h4>
          <p className="small" style={{ margin: 0 }}>
            {data.qis.map((q) => (
              <span key={q.id} style={{ marginRight: 10 }}>
                <span className="mono">{q.full_code ?? q.qrt_code}</span>{" "}
                {q.status === "found" ? <button className="btn btn-ghost" style={{ padding: 0 }} onClick={() => setPage(q.pages[0])}>p. {q.pages[0]}</button> : <span className="muted">{q.status === "missing" ? "manquant" : "n.a."}</span>}
              </span>
            ))}
          </p>
          <AnnexUpload doc={d} entity={entity ?? null} onDone={refresh} />
        </section>

        <section>
          <h4 style={{ margin: "0 0 var(--space-2)" }}>Journal des corrections</h4>
          <table className="table" style={{ fontSize: 12 }}>
            <thead><tr><th>Date</th><th>Cellule</th><th className="num">Avant</th><th className="num">Après</th><th>Motif</th></tr></thead>
            <tbody>
              {data.corrections.map((c) => {
                const cell = data.cells.find((x) => x.id === c.cell_id);
                return (
                  <tr key={c.id}>
                    <td className="nowrap">{fmtDateTime(c.corrected_at)}</td>
                    <td className="mono">{cell ? `${cell.qrt_code} ${cell.row_code} ${cell.col_code}` : "—"}</td>
                    <td className="num">{fmtAmount(c.value_before, settings.display_unit)}</td>
                    <td className="num">{c.action === "confirm" ? "confirmée" : fmtAmount(c.value_after, settings.display_unit)}</td>
                    <td>{c.reason}</td>
                  </tr>
                );
              })}
              {!data.corrections.length && <tr><td colSpan={5} className="muted">Aucune correction.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
      <div style={{ position: "sticky", top: 8, alignSelf: "start" }}>
        <p className="small muted" style={{ margin: "0 0 4px" }}>PDF source · page {pdfPage}</p>
        <PdfPane path={d.storage_path} page={pdfPage} />
      </div>
    </div>
  );
}

function UnitPanel({ d, onEvidence, onDone, disabled }: { d: SfcrDocument; onEvidence: () => void; onDone: () => void; disabled: boolean }) {
  const { toast } = useApp();
  const [unit, setUnit] = useState(d.unit_label ?? "thousands");
  const [currency, setCurrency] = useState(d.currency ?? "EUR");
  const [fx, setFx] = useState<{ rate: number; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const factor = UNIT_OPTS.find((u) => u[0] === unit)![2];

  useEffect(() => {
    if (currency === "EUR" || !d.reference_year) { setFx(null); return; }
    callCollect<{ rate: number; date: string }>({ action: "fx", currency, date: `${d.reference_year}-12-31` }).then(setFx).catch((e) => toast(`Cours BCE : ${e.message}`));
  }, [currency, d.reference_year, toast]);

  const validate = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("validate_unit", { p_document_id: d.id, p_unit_factor: factor, p_currency: currency, p_fx_rate: fx?.rate ?? null });
    if (!error && fx) await supabase.from("sfcr_documents").update({ fx_date: fx.date }).eq("id", d.id);
    setBusy(false);
    if (error) toast(error.message); else onDone();
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <strong>Unité et devise du SFCR</strong>
      <div className="small">
        {d.unit_evidence ? <>Extrait qui la justifie : « {d.unit_evidence} » <button className="btn btn-ghost" style={{ padding: 0 }} onClick={onEvidence}>voir p. {d.unit_evidence_page}</button></>
          : <>Aucune mention explicite : le millier est proposé par défaut.</>}
        {!d.unit_detected_explicitly && d.unit_evidence && <div className="sub">Proposition déduite (pas de mention explicite sur les QRT) : vérifiez sur le PDF.</div>}
      </div>
      <div className="actions">
        <Seg name="unit" value={unit} onChange={setUnit} options={UNIT_OPTS.map(([v, l]) => [v, l] as [string, string])} />
        <select className="input" style={{ width: 100 }} value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Devise">
          {["EUR", "USD", "GBP", "CHF", "JPY", "SEK", "NOK", "DKK"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {currency !== "EUR" && <p className="small" style={{ margin: 0 }}>{fx ? `Cours de référence BCE du ${fx.date} : 1 EUR = ${fx.rate} ${currency}` : "Recherche du cours BCE…"}</p>}
      <p className="small muted" style={{ margin: 0 }}>Les ratios et pourcentages ne sont jamais convertis. Valeur brute et facteur restent conservés.</p>
      <div><button className="btn btn-primary" disabled={busy || disabled || (currency !== "EUR" && !fx)} onClick={validate}>Valider : {UNIT_OPTS.find((u) => u[0] === unit)![1].toLowerCase()} {currency} → kEUR</button></div>
    </div>
  );
}

function ResetUnit({ docId, onDone }: { docId: string; onDone: () => void }) {
  const reset = async () => {
    await supabase.from("sfcr_documents").update({ unit_validated_at: null }).eq("id", docId);
    await supabase.rpc("refresh_document_status", { p_document_id: docId });
    onDone();
  };
  return <button className="btn btn-ghost" style={{ padding: 0 }} onClick={reset}>Revenir sur l'unité</button>;
}

function CellRow({ c, validated, onFocus, onDone }: { c: QrtCell; validated: boolean; onFocus: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const current = c.value_keur == null ? "" : String(Number(c.value_keur));
  const [value, setValue] = useState(current);
  const [reason, setReason] = useState("");
  const submit = async () => {
    if (!reason.trim()) { toast("Le motif est obligatoire."); return; }
    const v = value.trim() === "" ? null : Number(value.replace(/\s/g, "").replace(",", "."));
    if (v != null && !Number.isFinite(v)) { toast("Valeur invalide."); return; }
    const { error } = await supabase.rpc("apply_correction", { p_cell_id: c.id, p_value: v, p_reason: reason.trim() });
    if (error) toast(error.message); else onDone();
  };
  return (
    <tr onClick={onFocus} className="clickable">
      <td className="mono nowrap">{c.qrt_code} {c.row_code} {c.col_code}<div className="sub" style={{ fontFamily: "var(--font-body)", whiteSpace: "normal" }}>{c.row_label}</div></td>
      <td className="num">« {c.raw_text || "vide"} »<div className="sub">p. {c.pages.join(", ")}{validated ? ` · ${c.is_ratio ? fmtPct(c.value_keur, 2) : `${fmtAmount(c.value_keur == null ? null : Number(c.value_keur))} kEUR`}` : ""}</div></td>
      <td onClick={(e) => e.stopPropagation()}>
        {validated ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Vide = non renseigné" aria-label="Valeur corrigée" />
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (obligatoire)" aria-label="Motif" />
            <button className="btn btn-secondary" onClick={submit}>{value === current ? "Confirmer la valeur" : "Corriger"}</button>
          </div>
        ) : <span className="small muted">Unité à valider</span>}
      </td>
    </tr>
  );
}

/** Confirmation groupée (PDF scanné, QRT rapproché par libellé) : chaque cellule reste tracée individuellement. */
function BulkConfirm({ cells, onDone }: { cells: QrtCell[]; onDone: () => void }) {
  const { toast } = useApp();
  const fams = [...new Set(cells.map((c) => c.qrt_code))];
  const [fam, setFam] = useState(fams[0]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n = cells.filter((c) => c.qrt_code === fam).length;
  if (n < 5) return null;
  const go = async () => {
    if (!reason.trim()) { toast("Le motif est obligatoire."); return; }
    setBusy(true);
    for (const c of cells.filter((x) => x.qrt_code === fam)) {
      await supabase.rpc("apply_correction", { p_cell_id: c.id, p_value: c.value_keur == null ? null : Number(c.value_keur), p_reason: reason.trim() });
    }
    setBusy(false);
    onDone();
  };
  return (
    <div className="actions" style={{ marginBottom: "var(--space-2)" }}>
      <select className="input" style={{ width: 130 }} value={fam} onChange={(e) => setFam(e.target.value)}>{fams.map((f) => <option key={f}>{f}</option>)}</select>
      <input className="input" style={{ width: 260 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (ex. vérifié sur le PDF)" />
      <button className="btn btn-secondary" disabled={busy} onClick={go}>Confirmer les {n} cellules vérifiées</button>
    </div>
  );
}

function AnnexUpload({ doc, entity, onDone }: { doc: SfcrDocument; entity: Entity | null; onDone: () => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn btn-ghost" style={{ paddingLeft: 0 }}>
      {busy ? "Annexe en cours…" : "Joindre une annexe QRT (PDF ou Excel)"}
      <input type="file" hidden accept=".pdf,.xlsx,.xls" disabled={busy} onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        try {
          const r = await attachAnnex(doc, f, entity);
          toast(`Annexe rattachée : ${r.qrts} QRT, ${r.cells} cellule(s) ajoutée(s).`);
          onDone();
        } catch (x) { toast((x as Error).message); } finally { setBusy(false); }
      }} />
    </label>
  );
}
