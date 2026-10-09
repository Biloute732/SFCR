import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../context/AppContext";
import { indexCells, INDICATOR_KEYS, loadCells, loadEntities, useAsync } from "../lib/data";
import { IND_BY_ID, INDICATORS, resolve } from "../lib/indicators";
import { supabase } from "../lib/supabase";
import { fmtDelta, fmtValue } from "../lib/format";
import { countryName } from "../lib/countries";
import { exportWorkbook } from "../lib/export";
import type { Entity } from "../lib/types";
import { BranchFilter, CountryFilter, ErrorNote, Legal, Loading, PageHead } from "../components/ui";
import { TraceValue } from "../components/Trace";

// Encre, rouge FORSIDES puis rampes : lisibles sur fond clair, distinguées aussi par le tracé
const SERIES = [
  { stroke: "var(--color-text)", dash: undefined },
  { stroke: "var(--color-accent)", dash: undefined },
  { stroke: "var(--color-neutral-600)", dash: "6 3" },
  { stroke: "var(--color-accent-800)", dash: "6 3" },
  { stroke: "var(--color-neutral-500)", dash: "2 3" },
  { stroke: "var(--color-accent-400)", dash: "2 3" },
];
const BREAK_LABEL: Record<string, string> = { internal_model: "modèle interne", merger: "fusion", other: "rupture" };

export default function Evolution() {
  const { selection, branch, country, settings, toast, years: YEARS } = useApp();
  const [indId, setIndId] = useState(settings.favorite_indicators[0] ?? "scr_ratio");
  const [picked, setPicked] = useState<string[]>(selection.slice(0, 6));
  const { data, error, loading } = useAsync(async () => {
    const [entities, cells, br] = await Promise.all([
      loadEntities(), loadCells(INDICATOR_KEYS, null, null),
      supabase.from("method_breaks").select("*"),
    ]);
    return { entities, idx: indexCells(cells), breaks: (br.data ?? []) as { entity_id: string; reference_year: number; kind: string; note: string | null }[] };
  }, []);

  const ind = IND_BY_ID[indId] ?? INDICATORS[0];
  const indicators = INDICATORS.filter((i) => branch === "all" || i.branch === "any" || i.branch === branch);
  const eligible = (e: Entity) => ind.levels.includes(e.level)
    && (ind.branch === "any" || ind.branch === "activity" || e.type === ind.branch || e.type === "Mixte")
    && (branch === "all" || e.type === branch || e.type === "Mixte");
  const entities = (data?.entities ?? []).filter((e) => picked.includes(e.id) && eligible(e));
  const levelMix = new Set(entities.map((e) => e.level)).size > 1;

  const years = useMemo(() => {
    // Années d'analyse (Paramètres) et toute autre année validée des entités choisies
    const ys = new Set<number>(YEARS);
    for (const e of entities) for (const y of data?.idx.get(e.id)?.keys() ?? []) ys.add(y);
    return [...ys].sort();
  }, [entities, data, YEARS]);

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;

  const scale = (v: number | null) => (v == null ? null : ind.unit === "keur" && settings.display_unit === "MEUR" ? v / 1000 : v);
  const res = (e: Entity, y: number) => resolve(ind, e.level, data!.idx.get(e.id)?.get(y) ?? new Map());
  // Une année manquante reste un trou (null), jamais un zéro
  const chart = years.map((y) => Object.fromEntries([["year", y], ...entities.map((e) => [e.id, scale(res(e, y).value)])]));
  const breaks = data!.breaks.filter((b) => entities.some((e) => e.id === b.entity_id));
  const successorBreaks = entities.flatMap((e) => data!.entities.filter((p) => p.successor_id === e.id).map((p) => ({ e, p })));

  const doExport = () => {
    exportWorkbook({
      fileName: `evolution-${ind.id}.xlsx`, title: `Évolution · ${ind.label}`, displayUnit: settings.display_unit,
      summary: { header: ["Entité", "Pays", ...years.map(String)], rows: entities.map((e) => [e.name, countryName(e.country), ...years.map((y) => scale(res(e, y).value))]) },
      items: entities.flatMap((e) => years.map((y) => ({ entity: e, year: y, ind, r: res(e, y) }))),
    });
    toast("Export Excel généré.");
  };

  return (
    <main className="page">
      <PageHead kicker="Analyse" title="Évolution" intro="Un indicateur sur toutes les années disponibles, pour une ou plusieurs entités. Une année manquante apparaît comme un trou ; les ruptures de méthode sont signalées."
        actions={<button className="btn btn-primary" disabled={!entities.length} onClick={doExport}>Exporter en Excel</button>} />
      <section className="filters">
        <div className="actions">
          <span className="lbl">Indicateur</span>
          <select className="input" style={{ width: 300 }} value={ind.id} onChange={(e) => setIndId(e.target.value)}>
            {indicators.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </div>
        <BranchFilter />
        <CountryFilter entities={data?.entities ?? []} />
        <div className="actions">
          <select className="input" style={{ width: 280 }} value="" onChange={(e) => e.target.value && setPicked((p) => [...p, e.target.value])} aria-label="Ajouter une entité">
            <option value="">+ Ajouter une entité…</option>
            {(data?.entities ?? []).filter((e) => !picked.includes(e.id) && eligible(e) && (country === "all" || e.country === country)).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.level}, {e.country})</option>)}
          </select>
        </div>
      </section>
      {levelMix && <p className="note" style={{ marginTop: "var(--space-4)" }}>Attention : entités solo et groupes affichées ensemble ; un chiffre consolidé ne se compare pas à un chiffre solo.</p>}
      {!entities.length ? (
        <p className="muted" style={{ padding: "var(--space-6) 0" }}>Ajoutez une ou plusieurs entités {ind.branch === "Vie" || ind.branch === "Non-Vie" ? `(${ind.branch} ou Mixte) ` : ""}pour tracer « {ind.label} ».</p>
      ) : (
        <>
          <section className="section">
            <h3 className="section-title">{ind.label} <span className="muted">{ind.unit === "pct" ? "%" : settings.display_unit} · {ind.kind} · {ind.definition}</span></h3>
            <div className="chart-box" style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 24, right: 32, bottom: 8, left: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-neutral-300)" />
                  <XAxis dataKey="year" type="number" domain={[years[0], years[years.length - 1]]} ticks={years} tickFormatter={String} allowDecimals={false} padding={{ left: 30, right: 30 }}
                    tick={{ fontSize: 12, fill: "var(--color-neutral-700)" }} axisLine={{ stroke: "var(--color-text)", strokeWidth: 2 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--color-neutral-700)" }} tickFormatter={(v) => fmtValue(v, ind.unit, "kEUR")} width={90} axisLine={false} tickLine={false} />
                  <Tooltip labelFormatter={(y) => `Exercice ${y}`} formatter={(v, name) => [v == null ? "—" : fmtValue(Number(v), ind.unit, "kEUR"), entities.find((e) => e.id === name)?.name ?? name]}
                    contentStyle={{ borderRadius: 0, border: "1px solid var(--color-divider)" }} />
                  <Legend formatter={(id) => entities.find((e) => e.id === id)?.name ?? id} />
                  {breaks.map((b, i) => (
                    <ReferenceLine key={i} x={b.reference_year} stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="4 4"
                      label={{ value: `${entities.find((e) => e.id === b.entity_id)?.name.split(" ")[0]} : ${BREAK_LABEL[b.kind]}`, position: "insideTop", fill: "var(--color-accent-700)", fontSize: 11 }} />
                  ))}
                  {entities.map((e, i) => (
                    <Line key={e.id} dataKey={e.id} type="linear" connectNulls={false} isAnimationActive={false}
                      stroke={SERIES[i % SERIES.length].stroke} strokeDasharray={SERIES[i % SERIES.length].dash} strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2, fill: "var(--color-bg)" }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {breaks.length > 0 && <p className="small muted">Ligne rouge pointillée : rupture de méthode ({breaks.map((b) => `${entities.find((e) => e.id === b.entity_id)?.name} ${b.reference_year}, ${BREAK_LABEL[b.kind]}${b.note ? ` — ${b.note}` : ""}`).join(" ; ")}).</p>}
            {successorBreaks.length > 0 && <p className="small muted">Fusion : {successorBreaks.map(({ e, p }) => <span key={p.id}><Link to={`/compagnies/${p.id}`}>{p.name}</Link> → {e.name}. </span>)}La série du prédécesseur reste consultable sur sa fiche.</p>}
          </section>
          <section className="section table-wrap">
            <table className="table">
              <thead><tr><th>Entité</th>{years.map((y) => <th key={y} className="num">{y}</th>)}<th className="num">Variation {years[years.length - 1]} / {years[years.length - 2]}</th><th /></tr></thead>
              <tbody>
                {entities.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/compagnies/${e.id}`} style={{ color: "var(--color-text)" }}>{e.name}</Link> <span className="sub">{e.level} · {e.type} · {countryName(e.country)}</span></td>
                    {years.map((y) => <td key={y} className="num"><TraceValue ind={ind} r={res(e, y)} /></td>)}
                    <td className="num small">{fmtDelta(res(e, years[years.length - 1]).value, res(e, years[years.length - 2]).value, ind.unit, settings.display_unit) ?? "—"}</td>
                    <td><button className="btn btn-ghost" onClick={() => setPicked((p) => p.filter((x) => x !== e.id))}>Retirer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Legal />
          </section>
        </>
      )}
    </main>
  );
}
