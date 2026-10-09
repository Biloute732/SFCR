import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { LEGAL_NOTICE } from "../lib/format";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Identifiants incorrects." : error.message);
  };

  return (
    <div className="login">
      <div className="pane">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-name">FORSIDES</span>
          <span className="brand-sub">Comparateur SFCR</span>
        </div>
        <h1 style={{ fontSize: 42, margin: 0 }}>Connexion</h1>
        <p className="muted" style={{ margin: 0 }}>Outil interne, accès sur invitation d'un administrateur.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Adresse e-mail</label>
            <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pw">Mot de passe</label>
            <input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="note" role="alert" style={{ margin: 0 }}>{error}</p>}
          <button className="btn btn-primary" disabled={busy} type="submit" style={{ justifyContent: "flex-start" }}>
            {busy ? "Connexion…" : "Se connecter →"}
          </button>
        </form>
        <p className="small muted" style={{ marginTop: "var(--space-8)" }}>{LEGAL_NOTICE}</p>
      </div>
      <div className="pane red">
        <h6 style={{ color: "var(--color-accent-100)" }}>Solvabilité II · Luxembourg</h6>
        <h1>Des SFCR aux chiffres comparables.</h1>
        <p style={{ maxWidth: 480 }}>Collecte des listes du CAA, extraction des QRT, normalisation en kEUR, contrôles de cohérence et traçabilité jusqu'à la page du PDF.</p>
      </div>
    </div>
  );
}
