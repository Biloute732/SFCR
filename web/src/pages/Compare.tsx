import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "../context/AppContext";
import { indexCells, INDICATOR_KEYS, loadCells, loadEntities, useAsync } from "../lib/data";
import { INDICATORS, indicatorVisible, median, medianPeers, resolve, type Indicator } from "../lib/indicators";
import { fmtValue } from "../lib/format";
import { countriesIn, countryName } from "../lib/countries";
import { exportWorkbook, type ExportItem } from "../lib/export";
import type { Entity } from "../lib/types";
import { BranchFilter, CountryFilter, ErrorNote, Legal, Loading, PageHead, Seg } from "../components/ui";
import { TraceValue } from "../components/Trace";
import { selectionCheck } from "../components/SelectionBar";

export default function Compare() {
  const { selection, setSelection, branch, country, settings, toast, years: YEARS, latestYear } = useApp();
  const [year, setYear] = useState(latestYear);
  const { data, error, loading } = useAsync(async () => {
    const [entities, cells] = await Promise.all([loadEntities(), loadCells(INDICATOR_KEYS, null, YEARS)]);
    return { entities, idx: indexCells(cells) };
  }, [YEARS]);
  const [chartInd, setChartInd] = useState<string>("scr_ratio");
  const [adding, setAdding] = useState("");
  // Médiane du marché luxembourgeois (listes SFCR du CAA) par défaut ; sinon toute la base, ou un pays (toutes sources)
  const [medianScope, setMedianScope] = useState<string>("caa");

  const sel = useMemo(() => selection.map((id) => data?.entities.find((e) => e.id === id)).filter(Boolean) as Entity[], [selection, data]);
  const check = selectionCheck(sel);
  const level = sel[0]?.level ?? "Solo";
  const types = sel.map((e) => e.type);
  const visible = INDICATORS.filter((ind) => indicatorVisible(ind, branch, types, [level]));
  const hidden = INDICATORS.filter((ind) => ind.levels.includes(level) && !visible.includes(ind) && ind.branch !== "activity" && (branch === "all" || ind.branch === branch || ind.branch === "any"));

  const rows = useMemo(() => {
    if (!data) return [];
    return visible.map((ind) => {
      const vals = sel.map((e) => ({ e, r: resolve(ind, e.level, data.idx.get(e.id)?.get(year) ?? new Map()) }));
      const peerType = ind.branch === "activity" ? sel.find((e) => e.type !== "Mixte")?.type : undefined;
      const peers = medianPeers(ind, level, data.entities.filter((e) => medianScope === "all" || (medianScope === "caa" ? e.source === "caa_sfcr" : e.country === medianScope)), peerType);
      const pv = peers.map((p) => resolve(ind, p.level, data.idx.get(p.id)?.get(year) ?? new Map()).value).filter((v): v is number => v != null);
      return { ind, vals, med: median(pv), n: pv.length };
    });
  }, [data, sel, visible, year, level, medianScope]);

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;

  const chartRow = rows.find((r) => r.ind.id === chartInd) ?? rows[0];
  const scaleV = (v: number | null, ind: Indicator) => (v == null ? null : ind.unit === "keur" && settings.display_unit === "MEUR" ? v / 1000 : v);
  const chartData = chartRow ? chartRow.vals.map(({ e, r }) => ({ name: e.name, v: scaleV(r.value, chartRow.ind) })) : [];

  const medianLabel = medianScope === "all" ? "toute la base" : medianScope === "caa" ? "listes SFCR CAA" : countryName(medianScope);
  const doExport = () => {
    const items: ExportItem[] = rows.flatMap((row) => row.vals.map(({ e, r }) => ({ entity: e, year, ind: row.ind, r })));
    exportWorkbook({
      fileName: `comparaison-sfcr-${year}.xlsx`,
      title: `Comparaison SFCR ${year} · ${sel.length} entités ${level} · ${branch === "all" ? "Tout" : branch}`,
      displayUnit: settings.display_unit,
      summary: {
        header: ["Indicateur", "Unité", ...sel.map((e) => `${e.name} (${e.country})`), `Médiane de référence · ${medianLabel}`, "Entités retenues (médiane)"],
        rows: rows.map((row) => [
          row.ind.label, row.ind.unit === "pct" ? "%" : settings.display_unit,
          ...row.vals.map(({ r }) => scaleV(r.value, row.ind)), scaleV(row.med, row.ind), row.n,
        ]),
      },
      items,
    });
    toast("Export Excel généré.");
  };

  const candidates = (data?.entities ?? []).filter((e) => !selection.includes(e.id) && (!sel.length || e.level === level) && (country === "all" || e.country === country));
  const countries = countriesIn(data?.entities ?? []);

  return (
    <main className="page">
      <PageHead
        kicker="Analyse"
        title="Comparaison"
        intro="2 à 10 entités du même niveau sur une même année. Solvabilité et bilan se comparent quel que soit le type ; l'activité (primes, sinistres, provisions) seulement à branche égale."
        actions={<button className="btn btn-primary" disabled={!check.ok} onClick={doExport}>Exporter en Excel</button>}
      />
      <section className="filters">
        <div className="actions">
          <span className="lbl">Exercice</span>
          <Seg name="year" value={String(year)} onChange={(v) => setYear(+v)} options={YEARS.map((y) => [String(y), String(y)] as [string, string])} />
        </div>
        <BranchFilter />
        <CountryFilter entities={data?.entities ?? []} />
        <div className="actions">
          <span className="lbl">Médiane</span>
          <select className="input" style={{ width: 250 }} value={medianScope} onChange={(e) => setMedianScope(e.target.value)} aria-label="Population de la médiane">
            <option value="caa">Listes SFCR du CAA (Luxembourg)</option>
            <option value="all">Toute la base, tous pays</option>
            {countries.map(([c, n]) => <option key={c} value={c}>{n} : toutes les entités</option>)}
          </select>
        </div>
        <div className="actions">
          <select className="input" style={{ width: 280 }} value={adding} onChange={(e) => {
            const v = e.target.value; setAdding("");
            if (!v) return;
            if (selection.length >= 10) { toast("10 entités maximum par comparaison."); return; }
            setSelection((p) => [...p, v]);
          }} aria-label="Ajouter une entité">
            <option value="">+ Ajouter une entité…</option>
            {candidates.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.level}, {e.type}, {e.country})</option>)}
          </select>
        </div>
        <span className="count">{sel.length} / 10 · {level}</span>
      </section>

      {!check.ok || check.msg ? <p className={`note${check.ok ? " neutral" : ""}`} style={{ margin: "var(--space-4) 0 0" }}>{check.msg} {!sel.length && <Link to="/">Sélectionner depuis la liste des compagnies</Link>}</p> : null}

      {check.ok && (
        <>
          <section className="section table-wrap">
            <table className="table" style={{ minWidth: 300 + sel.length * 150 }}>
              <thead>
                <tr>
                  <th>Indicateur · {year}</th>
                  {sel.map((e) => (
                    <th key={e.id} className="num" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                      <Link to={`/compagnies/${e.id}?annee=${year}`} style={{ color: "var(--color-text)" }}>{e.name}</Link>
                      <div className="sub">{e.type} · {countryName(e.country)}{" "}<button className="btn btn-ghost" style={{ padding: "0 2px", fontSize: 11 }} onClick={() => setSelection((p) => p.filter((x) => x !== e.id))}>retirer</button></div>
                    </th>
                  ))}
                  <th className="num" style={{ background: "var(--color-surface)" }}>Médiane de référence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ ind, vals, med, n }) => (
                  <tr key={ind.id} className="clickable" onClick={() => setChartInd(ind.id)} style={chartInd === ind.id ? { background: "var(--color-accent-100)" } : undefined}>
                    <td>{ind.label} <span className="sub">{ind.unit === "pct" ? "%" : settings.display_unit} · {ind.kind}</span></td>
                    {vals.map(({ e, r }) => <td key={e.id} className="num" onClick={(ev) => ev.stopPropagation()}><TraceValue ind={ind} r={r} /></td>)}
                    <td className="num" style={{ background: "var(--color-surface)" }}>{fmtValue(med, ind.unit, settings.display_unit)}<div className="sub">{n} entité{n > 1 ? "s" : ""}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hidden.length > 0 && (
              <p className="small muted">Non comparés (branches différentes dans la sélection) : {hidden.map((h) => h.short).join(", ")}.</p>
            )}
            <p className="small muted">Médiane : entités {level.toLowerCase()} {medianScope === "all" ? "de toute la base, tous pays (listes SFCR, registres et ajouts manuels)" : medianScope === "caa" ? "des listes SFCR du CAA" : `dont le siège est en ${countryName(medianScope)} (toutes sources)`}, exercice {year}, valeurs validées uniquement ; pour l'activité, même branche (Mixtes incluses).</p>
          </section>

          <section className="section">
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h3 className="section-title" style={{ margin: 0 }}>{chartRow?.ind.label ?? ""} <span className="muted">{chartRow?.ind.unit === "pct" ? "%" : settings.display_unit} · {year}</span></h3>
              <select className="input" style={{ width: 300 }} value={chartRow?.ind.id ?? ""} onChange={(e) => setChartInd(e.target.value)} aria-label="Indicateur du graphique">
                {rows.map((r) => <option key={r.ind.id} value={r.ind.id}>{r.ind.label}</option>)}
              </select>
            </div>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 24, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-neutral-300)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--color-neutral-700)" }} interval={0} tickLine={false} axisLine={{ stroke: "var(--color-text)", strokeWidth: 2 }} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--color-neutral-700)" }} tickFormatter={(v) => fmtValue(v, chartRow?.ind.unit ?? "keur", "kEUR")} width={90} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmtValue(Number(v), chartRow?.ind.unit ?? "keur", "kEUR")} cursor={{ fill: "var(--color-neutral-200)" }} contentStyle={{ borderRadius: 0, border: "1px solid var(--color-divider)" }} />
                  {chartRow?.med != null && (
                    <ReferenceLine y={scaleV(chartRow.med, chartRow.ind)!} stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="6 4"
                      label={{ value: `Médiane (${chartRow.n})`, position: "insideTopRight", fill: "var(--color-accent-700)", fontSize: 12 }} />
                  )}
                  <Bar dataKey="v" isAnimationActive={false} maxBarSize={72}>
                    {chartData.map((d) => <Cell key={d.name} fill="var(--color-text)" />)}
                    <LabelList dataKey="v" position="top" formatter={(v: unknown) => (v == null ? "—" : fmtValue(Number(v), chartRow?.ind.unit ?? "keur", "kEUR"))} style={{ fontSize: 12, fill: "var(--color-text)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {chartData.some((d) => d.v == null) && <p className="small muted">Valeur absente : non validée ou non publiée (jamais affichée comme zéro).</p>}
            <Legal />
          </section>
        </>
      )}
    </main>
  );
}

