import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import { fmtDateTime } from "../lib/format";
import { Toast } from "./ui";

// [route, libellé, réservé aux administrateurs]
const NAV: [string, string, boolean?][] = [
  ["/", "Compagnies"],
  ["/comparaison", "Comparaison"],
  ["/evolution", "Évolution"],
  ["/collecte", "Collecte", true],
  ["/import", "Import en lot", true],
  ["/revue", "File de revue", true],
  ["/parametres", "Paramètres"],
  ["/aide", "Aide"],
];

interface RunInfo { status: string; summary: string | null; started_at: string; finished_at: string | null; kind: string }

/** Prochaine échéance planifiée (pg_cron) : 15/04 solo, 31/05 groupes, 30/06 relance des retardataires. */
function nextSchedule(now = new Date()) {
  const y = now.getFullYear();
  const dates = [
    [new Date(y, 3, 15), "collecte solo"], [new Date(y, 4, 31), "collecte groupes"], [new Date(y, 5, 30), "relance"],
    [new Date(y + 1, 3, 15), "collecte solo"],
  ] as [Date, string][];
  const n = dates.find(([d]) => d > now)!;
  return `${n[1]} prévue le ${n[0].toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}

export function Layout() {
  const { isAdmin, session } = useApp();
  const [run, setRun] = useState<RunInfo | null>(null);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [{ data: r }, { count }] = await Promise.all([
        supabase.from("collection_runs").select("status,summary,started_at,finished_at,kind").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("sfcr_documents").select("id", { count: "exact", head: true }).in("status", ["unit_pending", "review"]),
      ]);
      if (!alive) return;
      setRun(r as RunInfo | null);
      setReviewCount(count ?? 0);
    };
    void load();
    // L'état d'une collecte est toujours visible : rafraîchi en continu
    const ch = supabase.channel("layout-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "collection_runs" }, () => void load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sfcr_documents" }, () => void load())
      .subscribe();
    const t = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(t); void supabase.removeChannel(ch); };
  }, []);

  const running = run?.status === "running";
  const runText = !run
    ? `Aucune collecte lancée · ${nextSchedule()}`
    : running
      ? `Collecte en cours · ${run.summary ?? "démarrage"}`
      : `Dernière collecte ${fmtDateTime(run.finished_at ?? run.started_at)} · ${run.status === "error" ? "erreur" : run.status === "partial" ? "terminée avec alertes" : "succès"} · ${nextSchedule()}`;

  return (
    <div className="app">
      <div className="topbar">
        <span className="grow">Outil interne · FORSIDES Luxembourg · {session?.user.email} · {isAdmin ? "Administrateur" : "Utilisateur"}</span>
        <span><span className={`dot${running || run?.status === "error" ? "" : " idle"}`} />{runText}</span>
      </div>
      <header className="header">
        <NavLink to="/" className="brand" aria-label="Accueil">
          <span className="brand-name">FORSIDES</span>
          <span className="brand-sub">Comparateur SFCR</span>
        </NavLink>
        <nav className="mainnav" aria-label="Navigation principale">
          {NAV.filter(([, , adminOnly]) => isAdmin || !adminOnly).map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {label}
              {isAdmin && to === "/revue" && reviewCount > 0 && <span className="badge">{reviewCount}</span>}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
      <Toast />
    </div>
  );
}
