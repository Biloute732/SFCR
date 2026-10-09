import { useState, type FormEvent, type ReactNode } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { LEGAL_NOTICE } from "../lib/format";

const MIN_PASSWORD = 12;

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="login">
      <div className="pane">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-name">FORSIDES</span>
          <span className="brand-sub">Comparateur SFCR</span>
        </div>
        <h1 style={{ fontSize: 42, margin: 0 }}>{title}</h1>
        {children}
        <p className="small muted" style={{ marginTop: "var(--space-8)" }}>{LEGAL_NOTICE}</p>
      </div>
      <div className="pane red">
        <h6 style={{ color: "var(--color-accent-100)" }}>Solvabilité II · Luxembourg</h6>
        <h1>Des SFCR aux chiffres comparables.</h1>
      </div>
    </div>
  );
}

/** Compte authentifié mais absent de la liste des utilisateurs de l'outil. */
export function NoAccess() {
  const { session } = useApp();
  return (
    <Shell title="Accès non autorisé">
      <p style={{ margin: 0 }}>Le compte <strong>{session?.user.email}</strong> n'a pas accès au Comparateur SFCR. Demandez à un administrateur de vous créer un accès.</p>
      <div><button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>Se déconnecter</button></div>
    </Shell>
  );
}

/** Formulaire de changement de mot de passe (première connexion ou à la demande). */
export function PasswordForm({ onDone, submitLabel }: { onDone: () => void; submitLabel: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < MIN_PASSWORD) { setErr(`${MIN_PASSWORD} caractères minimum.`); return; }
    if (pw !== pw2) { setErr("Les deux saisies ne correspondent pas."); return; }
    setBusy(true);
    // L'obligation de changer le mot de passe provisoire est levée par la base dès que le mot de passe change
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPw(""); setPw2("");
    onDone();
  };
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", maxWidth: 380 }}>
      <div className="field">
        <label htmlFor="pw-new">Nouveau mot de passe ({MIN_PASSWORD} caractères minimum)</label>
        <input id="pw-new" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="pw-new2">Confirmer</label>
        <input id="pw-new2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      </div>
      {err && <p className="note" role="alert" style={{ margin: 0 }}>{err}</p>}
      <div><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : submitLabel}</button></div>
    </form>
  );
}

/** Première connexion avec un mot de passe provisoire : changement obligatoire. */
export function MustChangePassword() {
  const { passwordChanged } = useApp();
  return (
    <Shell title="Nouveau mot de passe">
      <p style={{ margin: 0 }}>Votre compte a été créé avec un mot de passe provisoire. Choisissez votre mot de passe pour continuer.</p>
      <PasswordForm onDone={passwordChanged} submitLabel="Enregistrer et continuer →" />
      <div><button className="btn btn-ghost" style={{ paddingLeft: 0 }} onClick={() => supabase.auth.signOut()}>Se déconnecter</button></div>
    </Shell>
  );
}
