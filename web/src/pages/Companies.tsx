import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { loadEntities, loadEntityYears, useAsync, yearSpan } from "../lib/data";
import { useCollection } from "../lib/collect";
import { fmtPct } from "../lib/format";
import { countryName } from "../lib/countries";
import type { EntityYear } from "../lib/types";
import {
  BranchFilter, CheckBox, CountryFilter, entityStatus, ErrorNote, Legal, Loading, PageHead, SearchInput, Seg, StatusTag, YearChip, type EntityStatus,
} from "../components/ui";
import { SelectionBar } from "../components/SelectionBar";
import { AddEntity } from "../components/AddEntity";
import { inPerimeter, perimeterBadge, PERIMETER_OPTIONS, type Perimeter } from "../lib/perimeter";

type SortKey = "name" | "lei" | "country" | "level" | "type" | "years" | "ratio" | "status";

export default function Companies() {
  const { branch, country, selection, setSelection, toast, years, isAdmin } = useApp();
  const nav = useNavigate();
  const { data, error, loading, reload } = useAsync(async () => {
    const [entities, years] = await Promise.all([loadEntities(), loadEntityYears()]);
    return { entities, years };
  }, []);
  const coll = useCollection((m) => { toast(m); void reload(); });
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<"all" | "Solo" | "Groupe">("all");
  const [perimeter, setPerimeter] = useState<Perimeter>("caa");
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<EntityStatus | "collect_na" | null>(null);
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState(1);

  const rows = useMemo(() => {
    if (!data) return [];
    const byEntity = new Map<string, EntityYear[]>();
    for (const y of data.years) byEntity.set(y.entity_id, [...(byEntity.get(y.entity_id) ?? []), y]);
    return data.entities.filter((e) => inPerimeter(e, perimeter)).map((e) => {
      const ys = (byEntity.get(e.id) ?? []).sort((a, b) => a.reference_year - b.reference_year);
      return { e, ys, nv: ys.filter((y) => y.year_status === "validated").length, st: entityStatus(ys, !!(e.caa_pdf_url || e.caa_page_url)) };
    });
  }, [data, perimeter]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const key: Record<SortKey, (r: (typeof rows)[number]) => string | number> = {
      name: (r) => r.e.name.toLowerCase(), lei: (r) => r.e.lei, country: (r) => countryName(r.e.country), level: (r) => r.e.level, type: (r) => r.e.type,
      years: (r) => r.nv, ratio: (r) => r.e.caa_ratio ?? -1, status: (r) => r.st,
    };
    return rows
      .filter((r) => branch === "all" || r.e.type === branch || r.e.type === "Mixte")
      .filter((r) => level === "all" || r.e.level === level)
      .filter((r) => country === "all" || r.e.country === country)
      .filter((r) => !status || (status === "collect_na" ? r.st === "collect" || r.st === "na" : r.st === status))
      .filter((r) => !s || r.e.name.toLowerCase().includes(s) || r.e.lei.toLowerCase().includes(s))
      .sort((a, b) => {
        const x = key[sort](a), y = key[sort](b);
        return (x > y ? 1 : x < y ? -1 : 0) * dir;
      });
  }, [rows, q, branch, country, level, status, sort, dir]);

  if (loading && !data) return <main className="page"><Loading /></main>;
  if (error) return <main className="page"><ErrorNote error={error} /></main>;

  const toggle = (id: string) => setSelection((prev) => {
    if (prev.includes(id)) return prev.filter((x) => x !== id);
    if (prev.length >= 10) { toast("10 entités maximum par comparaison."); return prev; }
    return [...prev, id];
  });
  const cnt = (s: EntityStatus) => rows.filter((r) => r.st === s).length;
  const stats: [number, string, EntityStatus | "collect_na" | null][] = [
    [rows.length, "Entités listées", null],
    [rows.filter((r) => r.nv >= 2).length, "Avec 2 années validées ou plus", null],
    [cnt("review"), "En revue", "review"],
    [cnt("collect") + cnt("na"), "Collecte en cours ou SFCR non disponible", "collect_na"],
  ];
  const cols: [SortKey, string, boolean?][] = [["name", "Compagnie"], ["lei", "LEI"], ["country", "Pays"], ["level", "Niveau"], ["type", "Type"], ["years", `Années ${yearSpan(years)}`], ["ratio", "Ratio SCR", true], ["status", "Statut"]];

  return (
    <main className="page">
      <PageHead
        kicker="Accueil"
        title="Compagnies"
        intro="Entités listées par le CAA (Vie, Non-Vie, Groupes), réassureurs et captives des registres du CAA, et compagnies des autres pays soumis à Solvabilité 2 ajoutées à la main. Seules les années validées servent aux analyses."
        actions={isAdmin && <>
          <button className="btn btn-secondary" onClick={() => setAdding(true)}>Ajouter une compagnie</button>
          <Link className="btn btn-secondary" to="/import">Import en lot</Link>
          <button className="btn btn-primary" disabled={coll.running} onClick={() => coll.collectAll().catch((e) => toast(e.message))}>
            {coll.running ? `${coll.step ?? "Collecte en cours"}${coll.progress ? ` ${coll.progress.done}/${coll.progress.total}` : ""}…` : "Lancer une collecte"}
          </button>
        </>}
      />

      <section className="stats">
        {stats.map(([v, l, f]) => (
          <button key={l} className={`stat${f && status === f ? " on" : ""}${f ? "" : " static"}`} onClick={() => f && setStatus(status === f ? null : f)}>
            <span className="v">{v}</span>
            <span className="l">{l}</span>
          </button>
        ))}
      </section>

      <section className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher un nom ou un LEI" />
        <div className="actions">
          <span className="lbl">Périmètre</span>
          <Seg<Perimeter> name="perimeter" value={perimeter} onChange={setPerimeter} options={PERIMETER_OPTIONS} />
        </div>
        <BranchFilter />
        <CountryFilter entities={rows.map((r) => r.e)} />
        <div className="actions">
          <span className="lbl">Niveau</span>
          <Seg name="level" value={level} onChange={setLevel} options={[["all", "Tout"], ["Solo", "Solo"], ["Groupe", "Groupe"]]} />
        </div>
        {status && <button className="btn btn-ghost" onClick={() => setStatus(null)}>Statut : {status === "review" ? "en revue" : "collecte / non disponible"} ✕</button>}
        <span className="count">{filtered.length} entité{filtered.length > 1 ? "s" : ""}{branch !== "all" ? " · Mixtes incluses" : ""}</span>
      </section>

      <section className="table-wrap">
        <table className="table" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              {cols.map(([k, l, right]) => (
                <th key={k} className={right ? "num" : undefined} style={{ cursor: "pointer", whiteSpace: "nowrap", color: sort === k ? "var(--color-text)" : undefined }}
                  onClick={() => (sort === k ? setDir(-dir) : (setSort(k), setDir(1)))} aria-sort={sort === k ? (dir > 0 ? "ascending" : "descending") : "none"}>
                  {l} {sort === k ? (dir > 0 ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ e, ys, st }) => {
              const sel = selection.includes(e.id);
              return (
                <tr key={e.id} className={`clickable${sel ? " sel" : ""}`} onClick={() => toggle(e.id)}>
                  <td><CheckBox on={sel} /></td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <Link to={`/compagnies/${e.id}`} onClick={(ev) => ev.stopPropagation()} style={{ fontWeight: 600, color: "var(--color-text)", textDecoration: "none" }}>{e.name}</Link>
                      {e.list_change === "new" && <span className="small" style={{ color: "var(--color-accent-700)" }}>Apparue dans la liste CAA depuis la dernière lecture</span>}
                      {e.list_change === "removed" && <span className="small" style={{ color: "var(--color-accent-700)" }}>N'apparaît plus dans la liste CAA</span>}
                      {e.is_demo && <span className="small muted">Donnée de démonstration</span>}
                      {perimeterBadge(e) && <span className="small muted">{perimeterBadge(e)}</span>}
                    </div>
                  </td>
                  <td className="mono small muted nowrap">{e.lei.startsWith("NOLEI:") ? "LEI à saisir" : e.lei}</td>
                  <td className="nowrap">{countryName(e.country)}</td>
                  <td>{e.level}</td>
                  <td><span className="tag tag-neutral">{e.type}</span></td>
                  <td>
                    <div className="years">
                      {years.map((y) => {
                        const yy = ys.find((x) => x.reference_year === y) ?? { reference_year: y, year_status: "pending" as const };
                        return <YearChip key={y} y={yy} onClick={"document_id" in yy && yy.document_id ? () => nav(`/compagnies/${e.id}?annee=${y}`) : undefined} />;
                      })}
                    </div>
                  </td>
                  <td className="num">{fmtPct(e.caa_ratio)}</td>
                  <td><StatusTag s={st} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="muted" style={{ padding: "var(--space-8) 0" }}>
            {rows.length ? `Aucune entité ne correspond à ces filtres.${country !== "all" && perimeter === "caa" && country !== "LU" ? " Les listes SFCR du CAA ne contiennent que des compagnies luxembourgeoises : choisissez le périmètre « Ajouts manuels » ou « Tout »." : ""}` : "Aucune entité pour l'instant : lancez une collecte pour lire les listes SFCR du CAA."}
          </p>
        )}
        <Legal extra="Ratio SCR : valeur affichée par le CAA pour le dernier exercice." />
      </section>

      <SelectionBar entities={data?.entities ?? []} />
      {adding && <AddEntity onClose={() => setAdding(false)} />}
    </main>
  );
}

