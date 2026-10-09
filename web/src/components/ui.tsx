import { useEffect, useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { useApp } from "../context/AppContext";
import { LEGAL_NOTICE } from "../lib/format";
import { countriesIn, countryName, SII_COUNTRIES } from "../lib/countries";
import type { Branch, EntityYear, YearStatus } from "../lib/types";

export function PageHead({ kicker, title, intro, actions }: { kicker: ReactNode; title: ReactNode; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="page-head">
      <div>
        <h6>{kicker}</h6>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </section>
  );
}

export function Seg<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map(([v, l]) => (
        <label key={v} className="seg-opt">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          {l}
        </label>
      ))}
    </div>
  );
}

/** Filtre Vie / Non-Vie / Tout, présent sur tous les écrans d'analyse (US7). */
export function BranchFilter() {
  const { branch, setBranch } = useApp();
  return (
    <div className="actions">
      <span className="lbl">Branche</span>
      <Seg<Branch> name="branch" value={branch} onChange={setBranch} options={[["all", "Tout"], ["Vie", "Vie"], ["Non-Vie", "Non-Vie"]]} />
    </div>
  );
}

/** Filtre pays (pays du siège) : options = pays présents parmi les entités affichées. */
export function CountryFilter({ entities }: { entities: { country: string }[] }) {
  const { country, setCountry } = useApp();
  const opts = countriesIn(entities);
  return (
    <div className="actions">
      <span className="lbl">Pays</span>
      <select className="input" style={{ width: 190 }} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Filtrer par pays">
        <option value="all">Tous les pays</option>
        {opts.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
        {country !== "all" && !opts.some(([c]) => c === country) && <option value={country}>{countryName(country)} ({country}) · aucune entité</option>}
      </select>
    </div>
  );
}

/** Choix du pays parmi les pays soumis à Solvabilité 2 (un code hors liste reste affiché pour être corrigé). */
export function CountrySelect({ id, value, onChange }: { id?: string; value: string; onChange: (c: string) => void }) {
  return (
    <select id={id} className="input" style={{ width: 200 }} value={value} onChange={(e) => onChange(e.target.value)}>
      {!SII_COUNTRIES.some(([c]) => c === value) && <option value={value}>{value || "—"} (hors Solvabilité 2)</option>}
      {SII_COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search">
      <Search size={16} aria-hidden />
      <input className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

export const YEAR_STATUS_LABEL: Record<YearStatus, string> = {
  validated: "Validée",
  review: "En revue",
  collecting: "Collecte en cours",
  pending: "À collecter",
  error: "Erreur d'extraction",
  not_found: "SFCR introuvable",
  not_applicable: "Non applicable",
  unavailable: "SFCR non disponible",
};

export function YearChip({ y, onClick }: { y: Pick<EntityYear, "reference_year" | "year_status">; onClick?: () => void }) {
  const title = `${y.reference_year} · ${YEAR_STATUS_LABEL[y.year_status]}`;
  if (onClick) {
    return <button type="button" className={`ychip y-${y.year_status}`} title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}>{y.reference_year}</button>;
  }
  return <span className={`ychip y-${y.year_status}`} title={title}>{y.reference_year}</span>;
}

export type EntityStatus = "ok" | "review" | "collect" | "na";
export const ENTITY_STATUS: Record<EntityStatus, [string, string]> = {
  ok: ["À jour", "tag tag-neutral"],
  review: ["En revue", "tag tag-accent"],
  collect: ["Collecte en cours", "tag tag-outline"],
  na: ["SFCR non disponible", "tag tag-plain"],
};

export function entityStatus(years: EntityYear[], hasLinks: boolean): EntityStatus {
  if (!hasLinks && !years.some((y) => y.document_id)) return "na";
  if (years.some((y) => y.year_status === "collecting" || y.year_status === "pending" || y.year_status === "error")) return "collect";
  if (years.some((y) => y.year_status === "review")) return "review";
  return "ok";
}

export function StatusTag({ s }: { s: EntityStatus }) {
  return <span className={ENTITY_STATUS[s][1]}>{ENTITY_STATUS[s][0]}</span>;
}

export function CheckBox({ on }: { on: boolean }) {
  return <span className={`check${on ? " on" : ""}`} aria-hidden>{on && <Check size={12} strokeWidth={3} />}</span>;
}

export function Legal({ extra }: { extra?: string }) {
  return <p className="footer-legal">{LEGAL_NOTICE}{extra ? ` ${extra}` : ""}</p>;
}

export function Toast() {
  const { toastMsg } = useApp();
  return toastMsg ? <div className="toast" role="status">{toastMsg}</div> : null;
}

export function Loading({ what = "Chargement" }: { what?: string }) {
  return <p className="muted" style={{ padding: "var(--space-6) 0" }}>{what}…</p>;
}

export function ErrorNote({ error }: { error: string }) {
  return <p className="note" style={{ margin: "var(--space-4) 0" }}>Erreur : {error}</p>;
}

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onClick={onClose} style={{ zIndex: 40 }}>
      <div className="dialog" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions ?? <button className="btn btn-secondary" onClick={onClose}>Fermer</button>}</div>
      </div>
    </div>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <div className="progress" aria-valuenow={pct} role="progressbar"><span style={{ width: `${pct}%` }} /></div>;
}

export function useDebounced<T>(v: T, ms = 200) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}
