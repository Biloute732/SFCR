import { useState } from "react";
import { useApp } from "../context/AppContext";
import { INDICATORS } from "../lib/indicators";
import { BUCKET, supabase } from "../lib/supabase";
import { fetchAll, useAsync } from "../lib/data";
import type { DisplayUnit } from "../lib/format";
import { CheckBox, Dialog, Legal, PageHead, Seg } from "../components/ui";
import { UsersAdmin } from "../components/UsersAdmin";
import { PasswordForm } from "./Account";

export default function Settings() {
  const { settings, saveSettings, session, toast, isAdmin } = useApp();
  const [pwOpen, setPwOpen] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const { data: demo, reload } = useAsync(async () => {
    const { count } = await supabase.from("entities").select("id", { count: "exact", head: true }).eq("is_demo", true);
    return count ?? 0;
  }, []);

  const toggleFav = (id: string) => {
    const has = settings.favorite_indicators.includes(id);
    void saveSettings({ favorite_indicators: has ? settings.favorite_indicators.filter((x) => x !== id) : [...settings.favorite_indicators, id] });
  };

  const removeDemo = async () => {
    const { error } = await supabase.from("entities").delete().eq("is_demo", true);
    setConfirmDemo(false);
    if (error) toast(error.message); else { toast("Données de démonstration supprimées."); void reload(); }
  };

  return (
    <main className="page">
      <PageHead kicker="Compte" title="Paramètres" actions={<button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>} />

      <section className="section grid-2">
        <div>
          <h3 className="section-title">Unité d'affichage</h3>
          <Seg<DisplayUnit> name="unit" value={settings.display_unit} onChange={(v) => saveSettings({ display_unit: v }).then(() => toast(`Montants affichés en ${v}.`))} options={[["kEUR", "kEUR"], ["MEUR", "MEUR"]]} />
          <p className="small muted">Préférence personnelle. Le stockage reste en kEUR ; seul l'affichage et l'export changent. Les ratios restent en %.</p>
        </div>
        <YearsSetting />
      </section>

      <section className="section grid-2">
        <div>
          <h3 className="section-title">Compte</h3>
          <dl className="kv">
            <dt>Utilisateur</dt><dd>{session?.user.email}</dd>
            <dt>Rôle</dt><dd>{isAdmin ? "Administrateur" : "Utilisateur (consultation et export)"}</dd>
            <dt>Dernière connexion</dt><dd>{session?.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString("fr-FR") : "—"}</dd>
            <dt>Hébergement</dt><dd>Supabase, région UE (eu-west-1)</dd>
          </dl>
        </div>
        <div>
          <h3 className="section-title">Mot de passe</h3>
          {pwOpen
            ? <PasswordForm submitLabel="Changer le mot de passe" onDone={() => { setPwOpen(false); toast("Mot de passe changé."); }} />
            : <button className="btn btn-secondary" onClick={() => setPwOpen(true)}>Changer mon mot de passe</button>}
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Indicateurs favoris <span className="muted">préférence personnelle · proposés en premier dans Évolution</span></h3>
        <table className="table">
          <tbody>
            {INDICATORS.map((ind) => (
              <tr key={ind.id} className="clickable" onClick={() => toggleFav(ind.id)}>
                <td style={{ width: 36 }}><CheckBox on={settings.favorite_indicators.includes(ind.id)} /></td>
                <td>{ind.label}<div className="sub">{ind.definition}</div></td>
                <td className="small">{ind.kind}</td>
                <td className="small">{ind.branch === "any" ? "Tous types" : ind.branch === "activity" ? "Même branche" : ind.branch}</td>
                <td className="mono small">{ind.solo[0].formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isAdmin && (
        <section className="section">
          <h3 className="section-title">Utilisateurs et accès</h3>
          <UsersAdmin />
        </section>
      )}

      {isAdmin && !!demo && (
        <section className="section">
          <h3 className="section-title">Données de démonstration <span className="muted">{demo} entité(s) fictive(s)</span></h3>
          <p className="small">Les entités « Démo » servent uniquement à essayer les écrans avant la première collecte. Elles ne proviennent d'aucun SFCR.</p>
          <button className="btn btn-secondary" onClick={() => setConfirmDemo(true)}>Supprimer les données de démonstration</button>
        </section>
      )}
      {isAdmin && <ResetSection />}
      {confirmDemo && (
        <Dialog title="Supprimer les données de démonstration ?" onClose={() => setConfirmDemo(false)}
          actions={<><button className="btn btn-secondary" onClick={() => setConfirmDemo(false)}>Annuler</button><button className="btn btn-primary" onClick={removeDemo}>Supprimer</button></>}>
          Les {demo} entités fictives, leurs SFCR et leurs cellules seront supprimés. Les données réelles ne sont pas touchées.
        </Dialog>
      )}
      <Legal />
    </main>
  );
}

/** Première année d'analyse ; la dernière suit automatiquement le dernier exercice publié. */
function YearsSetting() {
  const { settings, saveSettings, years, latestYear, toast, isAdmin } = useApp();
  const options: number[] = [];
  for (let y = 2016; y <= latestYear; y++) options.push(y);
  const change = (y: number) =>
    saveSettings({ first_year: y }).then(() => toast(`Années d'analyse : ${Math.min(y, latestYear)}–${latestYear}.`)).catch((e) => toast(e.message));
  return (
    <div>
      <h3 className="section-title">Années d'analyse</h3>
      <div className="actions">
        <span className="lbl">De</span>
        <select className="input" style={{ width: 110 }} value={settings.first_year} disabled={!isAdmin} onChange={(e) => change(+e.target.value)} aria-label="Première année">
          {options.map((y) => <option key={y}>{y}</option>)}
        </select>
        <span className="lbl">à {latestYear} <span className="muted">(dernier exercice publié)</span></span>
      </div>
      <p className="small muted">
        {years.length} exercice{years.length > 1 ? "s" : ""}. La dernière année avance seule : l'exercice N est ajouté le 1er avril N+1, quand les SFCR sont publiés.
        {isAdmin ? "Après un changement, lancez « Reprendre l'historique » dans l'écran Collecte pour chercher les SFCR des nouvelles années." : "Réglage commun, modifiable par un administrateur."}
      </p>
      {settings.first_year < 2023 && (
        <p className="note">
          Avant 2023, les SFCR suivent l'ancien règlement 2015/2452 : certains codes de lignes diffèrent et la table de correspondance est prévue en V2.
          Les valeurs extraites pour ces années passeront plus souvent en revue et sont à vérifier avec soin.
        </p>
      )}
    </div>
  );
}

type Level = "extraction" | "all";
const RESET: Record<Level, { title: string; text: string; word: string }> = {
  extraction: {
    title: "Refaire l'extraction",
    text: "Garde les entités et les PDF collectés. Efface les cellules, contrôles, corrections et validations d'unité : tous les SFCR repassent « à extraire ».",
    word: "EXTRAIRE",
  },
  all: {
    title: "Tout effacer",
    text: "Efface les entités, les SFCR et leurs PDF stockés, les cellules, corrections, alertes, l'historique de collecte et les cours BCE. Les données de démonstration, le compte et les paramètres sont conservés.",
    word: "EFFACER",
  },
};

/** Réinitialisation de la base (irréversible) : confirmation par saisie d'un mot. */
function ResetSection() {
  const { toast } = useApp();
  const [level, setLevel] = useState<Level | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (l: Level) => {
    setBusy(true);
    try {
      if (l === "all") {
        // Les PDF d'abord : une fois les lignes effacées, leurs chemins seraient perdus
        const docs = await fetchAll<{ storage_path: string | null }>((a, b) => supabase.from("sfcr_documents").select("storage_path").eq("is_demo", false).range(a, b));
        const atts = await fetchAll<{ storage_path: string }>((a, b) => supabase.from("sfcr_attachments").select("storage_path").range(a, b));
        const paths = [...docs.map((d) => d.storage_path), ...atts.map((x) => x.storage_path)].filter(Boolean) as string[];
        for (let i = 0; i < paths.length; i += 100) {
          const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
          if (error) throw new Error(`Stockage : ${error.message}`);
        }
      }
      const { error } = await supabase.rpc("reset_data", { p_level: l });
      if (error) throw new Error(error.message);
      toast(l === "all" ? "Base effacée. Lancez une collecte depuis l'accueil pour la reconstruire." : "Extraction réinitialisée. Relancez-la depuis l'écran Collecte.");
      setLevel(null);
      setTyped("");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <h3 className="section-title">Réinitialiser la base <span className="muted">irréversible</span></h3>
      <div className="grid-2">
        {(Object.keys(RESET) as Level[]).map((l) => (
          <div key={l} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "flex-start" }}>
            <strong>{RESET[l].title}</strong>
            <p className="small" style={{ margin: 0 }}>{RESET[l].text}</p>
            <button className="btn btn-secondary" onClick={() => { setLevel(l); setTyped(""); }}>{RESET[l].title}…</button>
          </div>
        ))}
      </div>
      {level && (
        <Dialog title={`${RESET[level].title} ?`} onClose={() => !busy && setLevel(null)}
          actions={<>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setLevel(null)}>Annuler</button>
            <button className="btn btn-primary" disabled={busy || typed !== RESET[level].word} onClick={() => run(level)}>{busy ? "En cours…" : RESET[level].title}</button>
          </>}>
          <p style={{ marginTop: 0 }}>{RESET[level].text} Cette action ne peut pas être annulée.</p>
          <div className="field">
            <label htmlFor="reset-word">Tapez <strong>{RESET[level].word}</strong> pour confirmer</label>
            <input id="reset-word" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        </Dialog>
      )}
    </section>
  );
}
