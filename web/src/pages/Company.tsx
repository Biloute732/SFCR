import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink, FileText } from "lucide-react";
import { useApp } from "../context/AppContext";
import { indexCells, indicatorFor, INDICATOR_KEYS, loadCells, loadEntities, useAsync, yearSpan } from "../lib/data";
import { INDICATORS, indicatorVisible, type Indicator } from "../lib/indicators";
import { QRT_BY_FAMILY } from "../lib/qrt";
import { BUCKET, supabase } from "../lib/supabase";
import { fmtDate, fmtDelta, fmtPct, ORIGIN_LABEL } from "../lib/format";
import type { Entity, EntityYear, QrtInstance, SfcrDocument } from "../lib/types";
import { BranchFilter, CheckBox, CountrySelect, Dialog, ErrorNote, Legal, Loading, PageHead, Seg, YEAR_STATUS_LABEL } from "../components/ui";
import { perimeterBadge } from "../lib/perimeter";
import { countryName, isSiiCountry, lookupLei } from "../lib/countries";
import { useCollection } from "../lib/collect";
import { TraceValue, useOpenPdf } from "../components/Trace";

interface Member { id: string; member_lei: string | null; member_name: string; country: string | null; page: number | null; document_id: string }
interface Break { id: string; reference_year: number; kind: string; note: string | null }

export default function Company() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { branch, settings, toast, years: YEARS, latestYear, isAdmin } = useApp();
  const openPdf = useOpenPdf();

  const { data, error, loading, reload } = useAsync(async () => {
    const [entities, yearsRes, docsRes, cells, breaksRes] = await Promise.all([
      loadEntities(),
      supabase.from("entity_year_status").select("*").eq("entity_id", id!),
      supabase.from("sfcr_documents").select("*").eq("entity_id", id!).order("reference_year", { ascending: false }).order("version", { ascending: false }),
      loadCells(INDICATOR_KEYS, [id!]),
      supabase.from("method_breaks").select("*").eq("entity_id", id!).order("reference_year"),
    ]);
    const docs = (docsRes.data ?? []) as SfcrDocument[];
    const currentIds = docs.filter((d) => d.is_current).map((d) => d.id);
    const [qrtsRes, membersRes] = await Promise.all([
      currentIds.length ? supabase.from("qrt_instances").select("*").in("document_id", currentIds) : Promise.resolve({ data: [] }),
      currentIds.length ? supabase.from("group_members").select("*").in("document_id", currentIds) : Promise.resolve({ data: [] }),
    ]);
    return {
      entities, entity: entities.find((e) => e.id === id) ?? null,
      years: (yearsRes.data ?? []) as EntityYear[], docs, idx: indexCells(cells),
      qrts: (qrtsRes.data ?? []) as QrtInstance[], members: (membersRes.data ?? []) as Member[], breaks: (breaksRes.data ?? []) as Break[],
    };
  }, [id]);

  const validatedYears = useMemo(() => (data?.years ?? []).filter((y) => y.year_status === "validated").map((y) => y.reference_year).sort(), [data]);
  const docYears = useMemo(() => [...new Set((data?.docs ?? []).filter((d) => d.is_current && d.reference_year).map((d) => d.reference_year!))].sort(), [data]);
  const year = Number(params.get("annee")) || validatedYears[validatedYears.length - 1] || docYears[docYears.length - 1] || latestYear;

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;
  if (!data?.entity) return <main className="page"><ErrorNote error="Entité introuvable" /></main>;
  const e = data.entity;

  const visible = INDICATORS.filter((ind) => indicatorVisible(ind, branch, [e.type], [e.level]) || (branch === "all" && ind.branch === "activity" && e.type !== "Mixte"));
  const val = (ind: Indicator, y: number) => indicatorFor(data.idx, e, y, ind.id);
  const yearDoc = data.docs.find((d) => d.is_current && d.reference_year === year);
  const yearStatus = data.years.find((y) => y.reference_year === year);
  const kpiIds = ["scr_ratio", "mcr_ratio", "own_funds", ...(e.type === "Non-Vie" ? ["gwp_nl"] : e.type === "Vie" ? ["gwp_life"] : branch === "Vie" ? ["gwp_life"] : ["gwp_nl", "gwp_life"])]
    .filter((k) => visible.some((v) => v.id === k)).slice(0, 4);
  const yearQrts = data.qrts.filter((q) => q.document_id === yearDoc?.id).sort((a, b) => a.qrt_code.localeCompare(b.qrt_code));
  const members = data.members.filter((m) => m.document_id === yearDoc?.id);
  const byLei = new Map(data.entities.map((x) => [x.lei, x]));
  const successor = data.entities.find((x) => x.id === e.successor_id);
  const predecessors = data.entities.filter((x) => x.successor_id === e.id);

  return (
    <main className="page">
      <PageHead
        kicker={`Fiche compagnie · ${e.level} · ${e.type} · ${countryName(e.country)}${e.source !== "caa_sfcr" ? ` · ${perimeterBadge(e)}` : ""}`}
        title={e.name}
        intro={<>
          <span className="mono">{e.lei.startsWith("NOLEI:") ? "LEI non publié par le CAA" : e.lei}</span>
          {" · "}Ratio CAA (dernier exercice) {fmtPct(e.caa_ratio)}
          {e.caa_pdf_url && <> · <a href={e.caa_pdf_url} target="_blank" rel="noreferrer">{e.source === "caa_sfcr" ? "SFCR (lien CAA)" : "dernier SFCR"} <ExternalLink size={12} /></a></>}
          {e.manager && <> · dirigeant : {e.manager}</>}
          {e.source !== "caa_sfcr" && !e.caa_pdf_url && !e.caa_page_url && <><br />Aucun lien SFCR connu : importez ses PDF (rattachement par LEI) ou saisissez la page SFCR via « Modifier la fiche ».</>}
          {e.caa_page_url && <> · <a href={e.caa_page_url} target="_blank" rel="noreferrer">page SFCR <ExternalLink size={12} /></a></>}
          {e.caa_contact && <> · contact : {e.caa_contact}</>}
          {e.type === "Mixte" && <><br />Entité Mixte : ses indicateurs non séparables apparaissent dans les vues Vie et Non-Vie avec la mention « Mixte ».</>}
          {successor && <><br />Successeur : <Link to={`/compagnies/${successor.id}`}>{successor.name}</Link></>}
          {predecessors.length > 0 && <><br />Prédécesseur(s) : {predecessors.map((p, i) => <span key={p.id}>{i ? ", " : ""}<Link to={`/compagnies/${p.id}`}>{p.name}</Link></span>)}</>}
        </>}
        actions={isAdmin && <>
          <EntityEditor e={e} entities={data.entities} onSaved={() => { toast("Fiche mise à jour."); void reload(); }} />
          <EntityDataActions e={e} docs={data.docs} onReset={() => void reload()} />
        </>}
      />

      <section className="filters">
        <div className="actions">
          <span className="lbl">Exercice</span>
          <div className="years">
            {YEARS.map((y) => {
              const ys = data.years.find((x) => x.reference_year === y) ?? { reference_year: y, year_status: "pending" as const };
              return (
                <button key={y} className={`ychip y-${ys.year_status}`} style={{ outline: y === year ? "2px solid var(--color-accent)" : undefined, outlineOffset: 2 }}
                  title={`${y} · ${YEAR_STATUS_LABEL[ys.year_status]}`} onClick={() => setParams({ annee: String(y) })}>{y}</button>
              );
            })}
          </div>
          {yearStatus && yearStatus.year_status !== "validated" && <span className="small pending-val">{YEAR_STATUS_LABEL[yearStatus.year_status]} : aucun chiffre affiché tant que le SFCR n'est pas validé.</span>}
        </div>
        <BranchFilter />
      </section>

      <section className="kpis">
        {kpiIds.map((k) => {
          const ind = INDICATORS.find((i) => i.id === k)!;
          const r = val(ind, year);
          const prev = val(ind, year - 1);
          const delta = fmtDelta(r.value, prev.value, ind.unit, settings.display_unit);
          const src = r.sources.find((s) => s.cell)?.cell;
          return (
            <div className="kpi" key={k}>
              <span className="lbl">{ind.label} · {year}{e.type === "Mixte" && ind.branch === "any" ? " · Mixte" : ""}</span>
              <span className="val"><TraceValue ind={ind} r={r} />{r.value != null && ind.unit === "keur" ? <span className="small muted" style={{ fontWeight: 400 }}> {settings.display_unit}</span> : null}</span>
              <span className="delta">{delta ? `${delta} vs ${year - 1}` : " "}</span>
              <span className="src">{r.value != null ? `${r.formula}${src ? ` · p. ${src.pages?.join(", ")}` : ""}` : " "}</span>
            </div>
          );
        })}
      </section>

      <section className="section">
        <h3 className="section-title">Indicateurs {yearSpan(YEARS)} <span className="muted">{settings.display_unit} · variations N / N-1</span></h3>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Indicateur</th><th>Type</th>
                {YEARS.map((y) => <th key={y} className="num">{y}</th>)}
                <th className="num">Variation {YEARS[YEARS.length - 1]} / {YEARS[YEARS.length - 2]}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ind) => {
                const last = val(ind, YEARS[YEARS.length - 1]), before = val(ind, YEARS[YEARS.length - 2]);
                return (
                  <tr key={ind.id}>
                    <td>{ind.label}{e.type === "Mixte" && ind.branch === "any" ? <span className="sub"> · Mixte</span> : null}<div className="sub">{ind.definition}</div></td>
                    <td className="small">{ind.kind}</td>
                    {YEARS.map((y) => <td key={y} className="num"><TraceValue ind={ind} r={val(ind, y)} /></td>)}
                    <td className="num small">{fmtDelta(last.value, before.value, ind.unit, settings.display_unit) ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section grid-2">
        <div>
          <h3 className="section-title">QRT {year} <span className="muted">{yearDoc ? `${yearQrts.filter((q) => q.status === "found").length} trouvés` : "aucun SFCR courant"}</span></h3>
          {yearDoc ? (
            <table className="table">
              <thead><tr><th>Code</th><th>Contenu</th><th>Statut</th><th className="num">Pages</th></tr></thead>
              <tbody>
                {yearQrts.map((q) => (
                  <tr key={q.id}>
                    <td className="mono small nowrap">{q.status === "found" ? <Link to={`/compagnies/${e.id}/qrt/${q.qrt_code}?annee=${year}`}>{q.full_code ?? q.qrt_code}</Link> : (q.full_code ?? q.qrt_code)}</td>
                    <td className="small">{QRT_BY_FAMILY[q.qrt_code]?.title ?? q.qrt_code}</td>
                    <td>{q.status === "found" ? (q.needs_review ? <span className="tag tag-accent">À revoir</span> : <span className="tag tag-neutral">Extrait</span>)
                      : q.status === "missing" ? <span className="tag tag-outline">Manquant</span> : <span className="tag tag-plain">Non applicable</span>}</td>
                    <td className="num small">{q.pages.length ? <button className="btn btn-ghost" onClick={() => openPdf(yearDoc.storage_path, q.pages[0])}>p. {q.pages.join(", ")}</button> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Pas de SFCR pour {year}. Voir l'écran Collecte.</p>}
        </div>
        <div>
          <h3 className="section-title">Documents</h3>
          <table className="table">
            <thead><tr><th>Exercice</th><th>Version</th><th>Origine</th><th>Collecte</th><th /></tr></thead>
            <tbody>
              {data.docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.reference_year ?? d.candidate_year ?? "?"}{d.is_current ? "" : <span className="sub"> · ancienne version</span>}</td>
                  <td className="small">v{d.version} · <span className="muted">{d.status === "validated" ? "validé" : d.status === "review" || d.status === "unit_pending" ? (isAdmin ? <Link to={`/revue/${d.id}`}>en revue</Link> : "en revue") : d.status}</span></td>
                  <td className="small">{ORIGIN_LABEL[d.origin]}</td>
                  <td className="small nowrap">{fmtDate(d.collected_at)}</td>
                  <td className="small nowrap">
                    <button className="btn btn-ghost" onClick={() => openPdf(d.storage_path)}><FileText size={13} /> PDF</button>
                    {d.source_url && <a href={d.source_url} target="_blank" rel="noreferrer">URL <ExternalLink size={11} /></a>}
                  </td>
                </tr>
              ))}
              {!data.docs.length && <tr><td colSpan={5} className="muted">Aucun document collecté.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {e.level === "Groupe" && (
        <section className="section">
          <h3 className="section-title">Filiales {year} <span className="muted">S.32.01.22 · {members.length} entité(s)</span></h3>
          <table className="table">
            <thead><tr><th>Entité</th><th>LEI</th><th>Pays</th><th className="num">Page</th></tr></thead>
            <tbody>
              {members.map((m) => {
                const known = m.member_lei ? byLei.get(m.member_lei) : undefined;
                return (
                  <tr key={m.id}>
                    <td>{known ? <Link to={`/compagnies/${known.id}`}>{known.name}</Link> : m.member_name}</td>
                    <td className="mono small">{m.member_lei ?? "—"}</td>
                    <td>{m.country ?? "—"}</td>
                    <td className="num"><button className="btn btn-ghost" onClick={() => openPdf(yearDoc?.storage_path, m.page)}>p. {m.page}</button></td>
                  </tr>
                );
              })}
              {!members.length && <tr><td colSpan={4} className="muted">Aucune filiale extraite pour {year}.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <section className="section">
        <h3 className="section-title">Ruptures de méthode <span className="muted">signalées sur les courbes d'évolution</span></h3>
        <Breaks entityId={e.id} breaks={data.breaks} onChange={reload} years={YEARS} readOnly={!isAdmin} />
        <Legal />
      </section>
    </main>
  );
}

function Breaks({ entityId, breaks, onChange, years, readOnly }: { entityId: string; breaks: Break[]; onChange: () => void; years: number[]; readOnly?: boolean }) {
  const { toast } = useApp();
  const [year, setYear] = useState(years[years.length - 1]);
  const [kind, setKind] = useState("internal_model");
  const [note, setNote] = useState("");
  const LABEL: Record<string, string> = { internal_model: "Passage en modèle interne", merger: "Fusion", other: "Autre" };
  const add = async () => {
    const { error } = await supabase.from("method_breaks").insert({ entity_id: entityId, reference_year: year, kind, note: note || null });
    if (error) toast(error.message); else { setNote(""); onChange(); }
  };
  const del = async (id: string) => { await supabase.from("method_breaks").delete().eq("id", id); onChange(); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {breaks.map((b) => (
        <div key={b.id} className="small">{b.reference_year} · {LABEL[b.kind]}{b.note ? ` — ${b.note}` : ""} {!readOnly && <button className="btn btn-ghost" onClick={() => del(b.id)}>Retirer</button>}</div>
      ))}
      {!breaks.length && readOnly && <p className="small muted" style={{ margin: 0 }}>Aucune rupture signalée.</p>}
      {!readOnly && <div className="actions">
        <select className="input" style={{ width: 100 }} value={year} onChange={(e) => setYear(+e.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <select className="input" style={{ width: 220 }} value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="input" style={{ width: 260 }} placeholder="Précision (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-secondary" onClick={add}>Signaler une rupture</button>
      </div>}
    </div>
  );
}

/**
 * Saisie manuelle : LEI (groupes), successeur (fusion), méthode de calcul groupe ;
 * pour une compagnie hors listes SFCR : nom, catégorie, type, pays et liens SFCR (collecte et historique).
 */
function EntityEditor({ e, entities, onSaved }: { e: Entity; entities: Entity[]; onSaved: () => void }) {
  const outside = e.source !== "caa_sfcr";
  const [open, setOpen] = useState(false);
  const [lei, setLei] = useState(e.lei.startsWith("NOLEI:") ? "" : e.lei);
  const [succ, setSucc] = useState(e.successor_id ?? "");
  const [method, setMethod] = useState(e.group_method ? String(e.group_method) : "");
  const [name, setName] = useState(e.name);
  const [category, setCategory] = useState(e.category);
  const [type, setType] = useState(e.type);
  const [country, setCountry] = useState(e.country ?? "LU");
  const [pageUrl, setPageUrl] = useState(e.caa_page_url ?? "");
  const [pdfUrl, setPdfUrl] = useState(e.caa_pdf_url ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [gleif, setGleif] = useState<string | null>(null);
  if (!open) return <button className="btn btn-secondary" onClick={() => setOpen(true)}>Modifier la fiche</button>;
  const url = (v: string) => {
    const t = v.trim();
    if (!t) return null;
    let u: URL;
    try { u = new URL(t); } catch { throw new Error(`Adresse invalide : ${t}`); }
    // Uniquement des adresses web : pas de « javascript: », « data: », « file: »…
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Adresse invalide (http ou https uniquement) : ${t}`);
    return u.toString();
  };
  const save = async () => {
    setErr(null);
    try {
      if (lei && !/^[0-9A-Z]{18}\d{2}$/.test(lei)) throw new Error("LEI invalide (20 caractères).");
      if (outside && !isSiiCountry(country)) throw new Error("Pays : choisissez un pays soumis à Solvabilité 2.");
      const { error } = await supabase.from("entities").update({
        ...(lei ? { lei } : {}), successor_id: succ || null, group_method: method ? Number(method) : null,
        // Hors listes SFCR : ces champs ne sont jamais écrasés par la lecture des listes du CAA
        ...(outside ? { name: name.trim() || e.name, category, type, country, caa_page_url: url(pageUrl), caa_pdf_url: url(pdfUrl) } : {}),
      }).eq("id", e.id);
      if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Ce LEI est déjà utilisé par une autre compagnie." : error.message);
      setOpen(false);
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", minWidth: 320 }}>
      {outside && <div className="field"><label>Nom</label><input className="input" value={name} onChange={(x) => setName(x.target.value)} /></div>}
      <div className="field"><label>LEI</label><input className="input mono" value={lei} onChange={(x) => setLei(x.target.value.toUpperCase().trim())} placeholder="20 caractères" /></div>
      {outside && (
        <>
          <div className="field"><label>Catégorie</label>
            <Seg<Entity["category"]> name="ed-cat" value={category} onChange={setCategory} options={[["assurance", "Assurance"], ["reassurance", "Réassurance"], ["captive", "Captive"]]} /></div>
          <div className="actions">
            <div className="field"><label>Type</label><Seg<Entity["type"]> name="ed-type" value={type} onChange={setType} options={[["Vie", "Vie"], ["Non-Vie", "Non-Vie"], ["Mixte", "Mixte"]]} /></div>
          </div>
          <div className="field"><label htmlFor="ed-country">Pays du siège</label>
            <div className="actions">
              <CountrySelect id="ed-country" value={country} onChange={setCountry} />
              <button type="button" className="btn btn-ghost" disabled={!/^[0-9A-Z]{18}\d{2}$/.test(lei)} onClick={async () => {
                setGleif("Lecture du registre GLEIF…");
                const r = await lookupLei(lei);
                if (r) setCountry(r.country);
                setGleif(!r ? "LEI introuvable dans le registre GLEIF (ou registre injoignable)." : isSiiCountry(r.country) ? `GLEIF : siège en ${countryName(r.country)}.` : `GLEIF : siège hors Solvabilité 2 (${r.country}).`);
              }}>Lire depuis le LEI</button>
            </div>
            {gleif && <span className="small muted">{gleif}</span>}
          </div>
          <div className="field"><label>Page SFCR</label><input className="input" value={pageUrl} onChange={(x) => setPageUrl(x.target.value)} placeholder="https://…" /></div>
          <div className="field"><label>Lien direct du dernier SFCR</label><input className="input" value={pdfUrl} onChange={(x) => setPdfUrl(x.target.value)} placeholder="https://….pdf" /></div>
        </>
      )}
      <div className="field"><label>Successeur (fusion)</label>
        <select className="input" value={succ} onChange={(x) => setSucc(x.target.value)}>
          <option value="">— aucun —</option>
          {entities.filter((x) => x.id !== e.id && x.level === e.level).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {e.level === "Groupe" && (
        <div className="field"><label>Méthode de calcul du groupe</label>
          <select className="input" value={method} onChange={(x) => setMethod(x.target.value)}>
            <option value="">Non précisée</option><option value="1">Méthode 1 (consolidation)</option><option value="2">Méthode 2 (déduction-agrégation)</option><option value="3">Combinaison</option>
          </select>
        </div>
      )}
      {err && <p className="note" style={{ margin: 0 }}>{err}</p>}
      <div className="actions"><button className="btn btn-secondary" onClick={() => setOpen(false)}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></div>
    </div>
  );
}


type DataMode = "reset" | "delete";

/**
 * Données d'une seule compagnie (irréversible) :
 *  - « reset »  : efface ses SFCR (toutes versions), PDF stockés, QRT, cellules, contrôles, corrections,
 *                 années introuvables et alertes, garde la fiche, puis relance sa collecte ;
 *  - « delete » : supprime aussi la fiche.
 * Les autres compagnies ne sont jamais touchées.
 */
function EntityDataActions({ e, docs, onReset }: { e: Entity; docs: SfcrDocument[]; onReset: () => void }) {
  const { toast, setSelection } = useApp();
  const nav = useNavigate();
  const coll = useCollection();
  const [mode, setMode] = useState<DataMode | null>(null);
  const [typed, setTyped] = useState("");
  const [recollect, setRecollect] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const removeFiles = async () => {
    // Les PDF d'abord : une fois les lignes effacées, leurs chemins seraient perdus
    const ids = docs.map((d) => d.id);
    const { data: atts } = ids.length
      ? await supabase.from("sfcr_attachments").select("storage_path").in("document_id", ids)
      : { data: [] as { storage_path: string }[] };
    const paths = [...docs.map((d) => d.storage_path), ...(atts ?? []).map((a) => a.storage_path)].filter(Boolean) as string[];
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) throw new Error(`Stockage : ${error.message}`);
    }
  };

  const run = async () => {
    try {
      setBusy("Suppression des PDF");
      await removeFiles();
      if (mode === "delete") {
        setBusy("Suppression de la fiche");
        // Cascade en base : documents, QRT, cellules, contrôles, corrections, alertes, ruptures, noms
        const { error } = await supabase.from("entities").delete().eq("id", e.id);
        if (error) throw new Error(error.message);
        setSelection((prev) => prev.filter((x) => x !== e.id));
        toast(`${e.name} supprimée.`);
        nav("/");
        return;
      }
      setBusy("Suppression des données");
      // Cascade depuis les documents : QRT, cellules, contrôles, corrections, filiales, annexes
      for (const [table, col] of [["sfcr_documents", "entity_id"], ["sfcr_year_flags", "entity_id"], ["alerts", "entity_id"]] as const) {
        const { error } = await supabase.from(table).delete().eq(col, e.id);
        if (error) throw new Error(`${table} : ${error.message}`);
      }
      setMode(null);
      onReset();
      if (recollect) {
        setBusy("Collecte du dernier SFCR");
        await coll.download([e.id]);
        setBusy("Reprise de l'historique");
        await coll.history([e.id]);
        toast(`${e.name} : données effacées et collecte relancée. Lancez l'extraction depuis l'écran Collecte.`);
      } else {
        toast(`${e.name} : données effacées. La fiche est conservée.`);
      }
      onReset();
    } catch (x) {
      toast((x as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmOk = mode === "delete" ? typed.trim() === e.name.trim() : typed.trim().toUpperCase() === "VIDER";

  return (
    <>
      <button className="btn btn-secondary" disabled={!!busy} onClick={() => { setMode("reset"); setTyped(""); }}>
        {busy ?? "Vider les données"}
      </button>
      <button className="btn btn-ghost" disabled={!!busy} onClick={() => { setMode("delete"); setTyped(""); }}>Supprimer la compagnie</button>
      {mode && (
        <Dialog title={mode === "reset" ? `Vider les données de ${e.name} ?` : `Supprimer ${e.name} ?`} onClose={() => !busy && setMode(null)}
          actions={<>
            <button className="btn btn-secondary" disabled={!!busy} onClick={() => setMode(null)}>Annuler</button>
            <button className="btn btn-primary" disabled={!!busy || !confirmOk} onClick={run}>
              {busy ? `${busy}…` : mode === "reset" ? (recollect ? "Vider et relancer la collecte" : "Vider les données") : "Supprimer définitivement"}
            </button>
          </>}>
          {mode === "reset" ? (
            <>
              <p style={{ marginTop: 0 }}>
                Seront effacés pour cette compagnie uniquement : {docs.length} SFCR (toutes versions) et leurs PDF stockés, les QRT et cellules extraits,
                les validations d'unité, les corrections, les années « introuvables » et les alertes.
                La fiche est conservée : nom, LEI, liens du CAA, successeur et ruptures de méthode. Cette action ne peut pas être annulée.
              </p>
              <label className="radio" style={{ marginBottom: "var(--space-3)" }}>
                <input type="checkbox" checked={recollect} onChange={(x) => setRecollect(x.target.checked)} />
                <CheckBox on={recollect} />
                Relancer ensuite la collecte de cette compagnie (dernier SFCR + historique)
              </label>
              <div className="field">
                <label htmlFor="reset-word">Tapez <strong>VIDER</strong> pour confirmer</label>
                <input id="reset-word" className="input" autoComplete="off" value={typed} onChange={(x) => setTyped(x.target.value)} />
              </div>
            </>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                Seront effacés : la fiche, {docs.length} SFCR (toutes versions) et leurs PDF stockés, les QRT et cellules extraits,
                les validations, les corrections, les alertes et les ruptures de méthode. Cette action ne peut pas être annulée.
              </p>
              {e.in_caa_list && !e.is_demo && (
                <p className="note">Cette compagnie figure dans les listes du CAA : la prochaine lecture des listes la recréera, sans ses données. Pour simplement recommencer sa collecte, préférez « Vider les données ».</p>
              )}
              <div className="field">
                <label htmlFor="del-name">Tapez le nom exact pour confirmer : <strong>{e.name}</strong></label>
                <input id="del-name" className="input" autoComplete="off" value={typed} onChange={(x) => setTyped(x.target.value)} />
              </div>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
