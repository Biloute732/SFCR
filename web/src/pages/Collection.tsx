import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useApp } from "../context/AppContext";
import { fetchAll, loadEntities, loadEntityYears, useAsync, yearSpan } from "../lib/data";
import { useCollection } from "../lib/collect";
import { inPerimeter, PERIMETER_OPTIONS, type Perimeter } from "../lib/perimeter";
import { useExtractionQueue } from "../lib/useExtractionQueue";
import { supabase } from "../lib/supabase";
import { fmtDateTime, ORIGIN_LABEL } from "../lib/format";
import type { EntityYear, SfcrDocument } from "../lib/types";
import { ErrorNote, Legal, Loading, PageHead, ProgressBar, SearchInput, Seg, YearChip, YEAR_STATUS_LABEL } from "../components/ui";

interface Alert { id: string; entity_id: string | null; kind: string; message: string; url: string | null; created_at: string; resolved_at: string | null }
interface Run { id: string; kind: string; trigger: string; status: string; started_at: string; finished_at: string | null; summary: string | null; progress: number; total: number | null; log: { at: string; msg: string }[] }
interface QI { document_id: string; qrt_code: string; status: string }

const ALERT_LABEL: Record<string, string> = {
  broken_link: "Lien cassé", new_entity: "Nouvelle entité", removed_entity: "Entité disparue", missing_qrt: "QRT manquant",
  scanned: "PDF scanné", robots: "robots.txt", other: "Autre",
};
const RUN_LABEL: Record<string, string> = { caa_lists: "Listes CAA", download: "Téléchargement", history: "Historique", scheduled: "Planifiée" };

export default function Collection() {
  const { toast, years: YEARS } = useApp();
  const { data, error, loading, reload } = useAsync(async () => {
    const [entities, years, docs, alerts, runs, qis] = await Promise.all([
      loadEntities(), loadEntityYears(),
      fetchAll<SfcrDocument>((a, b) => supabase.from("sfcr_documents").select("*").order("collected_at", { ascending: false }).range(a, b)),
      supabase.from("alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(200),
      supabase.from("collection_runs").select("*").order("started_at", { ascending: false }).limit(10),
      fetchAll<QI>((a, b) => supabase.from("qrt_instances").select("document_id,qrt_code,status").neq("status", "found").range(a, b)),
    ]);
    return { entities, years, docs, alerts: (alerts.data ?? []) as Alert[], runs: (runs.data ?? []) as Run[], qis };
  }, []);
  const coll = useCollection((m) => { toast(m); void reload(); });
  const queue = useExtractionQueue((m) => { toast(m); void reload(); });
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "issues">("all");
  const [perimeter, setPerimeter] = useState<Perimeter>("caa");
  const [openRun, setOpenRun] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.entities
      .filter((e) => inPerimeter(e, perimeter))
      .filter((e) => !s || e.name.toLowerCase().includes(s) || e.lei.toLowerCase().includes(s))
      .map((e) => {
        const ys = YEARS.map((y) => data.years.find((x) => x.entity_id === e.id && x.reference_year === y) ?? ({ entity_id: e.id, reference_year: y, year_status: "pending" } as EntityYear));
        const alerts = data.alerts.filter((a) => a.entity_id === e.id);
        return { e, ys, alerts };
      })
      .filter((r) => only === "all" || r.alerts.length || r.ys.some((y) => !["validated", "not_applicable"].includes(y.year_status)));
  }, [data, q, only, perimeter]);

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;

  const pending = data!.docs.filter((d) => d.status === "to_extract" || d.status === "error" || d.status === "extracting");
  const busy = coll.running || queue.running;
  const missingFor = (docId: string | null) => (docId ? data!.qis.filter((x) => x.document_id === docId) : []);
  const resolveAlert = async (id: string) => { await supabase.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", id); void reload(); };
  const resolveAll = async () => { await supabase.from("alerts").update({ resolved_at: new Date().toISOString() }).is("resolved_at", null); void reload(); };

  return (
    <main className="page">
      <PageHead
        kicker="Données"
        title="Collecte"
        intro="Suivi par entité et par année : PDF trouvés et leur origine, liens cassés, QRT manquants ou non applicables. Collecte planifiée mi-avril (solo), fin mai (groupes), puis relance mensuelle jusqu'à fin juin."
        actions={<>
          <button className="btn btn-secondary" disabled={busy} onClick={() => coll.readLists().catch((e) => toast(e.message))}>Lire les listes CAA</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => coll.download().catch((e) => toast(e.message))}>Télécharger les SFCR</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => coll.history().catch((e) => toast(e.message))}>Reprendre {yearSpan(YEARS)}</button>
          <button className="btn btn-primary" disabled={busy || !pending.length} onClick={() => queue.run(pending)}>Extraire {pending.length} PDF en attente</button>
        </>}
      />

      {(coll.running || queue.running) && (
        <section className="section" aria-live="polite">
          {coll.running && <p style={{ margin: 0 }}><strong>{coll.step}</strong>{coll.progress ? ` · ${coll.progress.done}/${coll.progress.total} entités` : ""} · requêtes espacées, robots.txt respecté</p>}
          {coll.progress && <ProgressBar done={coll.progress.done} total={coll.progress.total} />}
          {queue.running && (
            <>
              <p style={{ margin: 0 }}><strong>Extraction {queue.count ? `${queue.count.done + 1}/${queue.count.total}` : ""}</strong> · {queue.current} · {queue.step?.msg}{queue.step?.total ? ` ${queue.step.done}/${queue.step.total}` : ""}</p>
              {queue.step?.total ? <ProgressBar done={queue.step.done ?? 0} total={queue.step.total} /> : null}
            </>
          )}
        </section>
      )}

      <section className="stats">
        {[
          [data!.docs.filter((d) => d.is_current).length, "SFCR collectés (versions courantes)"],
          [pending.length, "PDF à extraire ou en erreur"],
          [data!.alerts.filter((a) => a.kind === "broken_link").length, "Liens cassés"],
          [data!.qis.filter((x) => x.status === "missing").length, "QRT manquants"],
        ].map(([v, l]) => <div key={l as string} className="stat static"><span className="v">{v}</span><span className="l">{l}</span></div>)}
      </section>

      <section className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher un nom ou un LEI" />
        <Seg<Perimeter> name="perimeter" value={perimeter} onChange={setPerimeter} options={PERIMETER_OPTIONS} />
        <Seg name="only" value={only} onChange={setOnly} options={[["all", "Toutes les entités"], ["issues", "À traiter"]]} />
        <span className="count">{rows.length} entité(s)</span>
      </section>

      <section className="table-wrap">
        <table className="table" style={{ minWidth: 1000 }}>
          <thead><tr><th>Entité</th>{YEARS.map((y) => <th key={y}>{y}</th>)}<th>Alertes</th></tr></thead>
          <tbody>
            {rows.map(({ e, ys, alerts }) => (
              <tr key={e.id}>
                <td>
                  <Link to={`/compagnies/${e.id}`} style={{ fontWeight: 600, color: "var(--color-text)", textDecoration: "none" }}>{e.name}</Link>
                  <div className="sub">{e.level} · {e.type}{!e.caa_pdf_url && !e.caa_page_url ? " · SFCR non disponible" : ""}{e.caa_contact ? ` · ${e.caa_contact}` : ""}</div>
                </td>
                {ys.map((y) => {
                  const miss = missingFor(y.document_id);
                  return (
                    <td key={y.reference_year} className="small">
                      <div className="actions" style={{ gap: 6 }}>
                        <YearChip y={y} />
                        <span>{YEAR_STATUS_LABEL[y.year_status]}</span>
                      </div>
                      {y.origin && <div className="sub">{ORIGIN_LABEL[y.origin]} · {fmtDateTime(y.collected_at)}{y.version && y.version > 1 ? ` · v${y.version}` : ""} {y.source_url && <a href={y.source_url} target="_blank" rel="noreferrer"><ExternalLink size={11} /></a>}</div>}
                      {miss.length > 0 && <div className="sub">{miss.filter((m) => m.status === "missing").length ? <span style={{ color: "var(--color-accent-700)" }}>Manquant : {miss.filter((m) => m.status === "missing").map((m) => m.qrt_code).join(", ")}</span> : null}{miss.filter((m) => m.status === "not_applicable").length ? <> Non applicable : {miss.filter((m) => m.status === "not_applicable").map((m) => m.qrt_code).join(", ")}</> : null}</div>}
                    </td>
                  );
                })}
                <td className="small">
                  {alerts.slice(0, 3).map((a) => <div key={a.id}><span className="tag tag-accent">{ALERT_LABEL[a.kind]}</span> {a.message.replace(`${e.name} : `, "")}</div>)}
                  {alerts.length > 3 && <div className="sub">+{alerts.length - 3} autre(s)</div>}
                  <button className="btn btn-ghost" disabled={busy} onClick={() => coll.download([e.id]).catch((x) => toast(x.message))}>Relancer</button>
                  <button className="btn btn-ghost" disabled={busy} onClick={() => coll.history([e.id]).catch((x) => toast(x.message))}>Historique</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted" style={{ padding: "var(--space-6) 0" }}>Aucune entité. Commencez par « Lire les listes CAA ».</p>}
      </section>

      <section className="section grid-2">
        <div>
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <h3 className="section-title" style={{ margin: 0 }}>Alertes <span className="muted">{data!.alerts.length} non traitée(s)</span></h3>
            {data!.alerts.length > 0 && <button className="btn btn-ghost" onClick={resolveAll}>Tout marquer comme traité</button>}
          </div>
          <table className="table">
            <tbody>
              {data!.alerts.slice(0, 50).map((a) => (
                <tr key={a.id}>
                  <td className="small nowrap">{fmtDateTime(a.created_at)}</td>
                  <td><span className="tag tag-accent">{ALERT_LABEL[a.kind]}</span></td>
                  <td className="small">{a.message} {a.url && <a href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={11} /></a>}</td>
                  <td><button className="btn btn-ghost" onClick={() => resolveAlert(a.id)}>Traité</button></td>
                </tr>
              ))}
              {!data!.alerts.length && <tr><td className="muted">Aucune alerte.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="section-title">Dernières exécutions</h3>
          <table className="table">
            <thead><tr><th>Début</th><th>Type</th><th>Statut</th><th>Résumé</th></tr></thead>
            <tbody>
              {data!.runs.map((r) => (
                <Fragment key={r.id}>
                  <tr className="clickable" onClick={() => setOpenRun(openRun === r.id ? null : r.id)}>
                    <td className="small nowrap">{fmtDateTime(r.started_at)}</td>
                    <td className="small">{RUN_LABEL[r.kind]}{r.trigger === "schedule" ? " · planifiée" : ""}</td>
                    <td><span className={r.status === "error" ? "tag tag-accent" : r.status === "running" ? "tag tag-outline" : "tag tag-neutral"}>{r.status === "running" ? "En cours" : r.status === "success" ? "Succès" : r.status === "partial" ? "Avec alertes" : "Erreur"}</span></td>
                    <td className="small">{r.summary}</td>
                  </tr>
                  {openRun === r.id && <tr><td colSpan={4}><pre className="log">{(r.log ?? []).map((l) => `${l.at.slice(11, 19)}  ${l.msg}`).join("\n") || "Journal vide"}</pre></td></tr>}
                </Fragment>
              ))}
              {!data!.runs.length && <tr><td colSpan={4} className="muted">Aucune exécution.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <Legal />
    </main>
  );
}
