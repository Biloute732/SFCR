import { useState } from "react";
import { useApp, type Role } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { useAsync } from "../lib/data";
import { fmtDateTime } from "../lib/format";
import { Dialog, ErrorNote, Loading, Seg } from "./ui";

interface AppUser {
  user_id: string;
  email: string;
  role: Role;
  must_change_password: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  is_me: boolean;
}

const ROLE_LABEL: Record<Role, string> = { admin: "Administrateur", user: "Utilisateur" };

async function callAdmin<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error ?? msg;
    } catch { /* message par défaut */ }
    throw new Error(msg);
  }
  return data as T;
}

/** Mot de passe provisoire lisible (sans caractères ambigus), 16 caractères. */
function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => chars[b % chars.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

/** Gestion des accès : réservée aux administrateurs (contrôle réel côté serveur). */
export function UsersAdmin() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useAsync(async () => (await callAdmin<{ users: AppUser[] }>({ action: "list" })).users, []);
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [removing, setRemoving] = useState<AppUser | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await callAdmin(body); toast(ok); await reload(); return true; }
    catch (e) { toast((e as Error).message); return false; }
    finally { setBusy(false); }
  };

  const resetPassword = async (u: AppUser) => {
    const password = tempPassword();
    if (await run({ action: "reset_password", user_id: u.user_id, password }, `Mot de passe provisoire régénéré pour ${u.email}.`)) {
      setIssued({ email: u.email, password });
    }
  };

  if (loading && !data) return <Loading what="Chargement des utilisateurs" />;
  if (error) return <ErrorNote error={error} />;
  const admins = (data ?? []).filter((u) => u.role === "admin").length;

  return (
    <div>
      <table className="table">
        <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Dernière connexion</th><th /></tr></thead>
        <tbody>
          {(data ?? []).map((u) => (
            <tr key={u.user_id}>
              <td>
                {u.email}{u.is_me && <span className="sub"> · vous</span>}
                {u.must_change_password && <div className="sub">Mot de passe provisoire non encore changé</div>}
              </td>
              <td>
                <Seg<Role> name={`role-${u.user_id}`} value={u.role}
                  onChange={(r) => {
                    if (u.role === "admin" && r !== "admin" && admins <= 1) { toast("Il doit rester au moins un administrateur."); return; }
                    void run({ action: "set_role", user_id: u.user_id, role: r }, `${u.email} : ${ROLE_LABEL[r].toLowerCase()}.`);
                  }}
                  options={[["admin", "Administrateur"], ["user", "Utilisateur"]]} />
              </td>
              <td className="small nowrap">{u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : "jamais"}</td>
              <td className="nowrap">
                {!u.is_me && <button className="btn btn-ghost" disabled={busy} onClick={() => resetPassword(u)}>Nouveau mot de passe</button>}
                {!u.is_me && <button className="btn btn-ghost" disabled={busy} onClick={() => setRemoving(u)}>Retirer l'accès</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions" style={{ marginTop: "var(--space-3)" }}>
        <button className="btn btn-secondary" onClick={() => setAdding(true)}>Ajouter un utilisateur</button>
      </div>
      <p className="small muted">
        Administrateur : collecte, import, revue, corrections, fiches, réinitialisations, années d'analyse et gestion des accès.
        Utilisateur : consultation des compagnies, comparaison, évolution et export Excel.
      </p>

      {adding && <AddUser onClose={() => setAdding(false)} onCreated={(email, password) => { setAdding(false); setIssued({ email, password }); void reload(); }} />}

      {issued && (
        <Dialog title="Identifiants à transmettre" onClose={() => setIssued(null)}>
          <p style={{ marginTop: 0 }}>Transmettez ces identifiants à <strong>{issued.email}</strong> par un canal sûr. Le mot de passe provisoire devra être changé à la première connexion. Il ne sera plus affiché après fermeture de cette fenêtre.</p>
          <dl className="kv">
            <dt>Adresse</dt><dd className="mono">{issued.email}</dd>
            <dt>Mot de passe provisoire</dt><dd className="mono">{issued.password}</dd>
            <dt>Adresse de l'outil</dt><dd className="mono">{window.location.origin}</dd>
          </dl>
          <button className="btn btn-ghost" style={{ paddingLeft: 0 }}
            onClick={() => navigator.clipboard?.writeText(`Comparateur SFCR : ${window.location.origin}\nIdentifiant : ${issued.email}\nMot de passe provisoire : ${issued.password}`).then(() => toast("Copié."))}>
            Copier
          </button>
        </Dialog>
      )}

      {removing && (
        <Dialog title={`Retirer l'accès de ${removing.email} ?`} onClose={() => !busy && setRemoving(null)}
          actions={<>
            <button className="btn btn-secondary" disabled={busy} onClick={() => setRemoving(null)}>Annuler</button>
            <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run({ action: "remove", user_id: removing.user_id }, `Accès de ${removing.email} retiré.`)) setRemoving(null); }}>Retirer l'accès</button>
          </>}>
          Le compte est supprimé : cette personne ne pourra plus se connecter. Les données de l'outil (SFCR, corrections, analyses) ne sont pas touchées.
        </Dialog>
      )}
    </div>
  );
}

function AddUser({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password] = useState(tempPassword);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await callAdmin({ action: "create", email: email.trim(), role, password });
      onCreated(email.trim().toLowerCase(), password);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Ajouter un utilisateur" onClose={() => !busy && onClose()}
      actions={<>
        <button className="btn btn-secondary" disabled={busy} onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || !email.includes("@")} onClick={create}>{busy ? "Création…" : "Créer l'accès"}</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div className="field">
          <label htmlFor="new-email">Adresse e-mail</label>
          <input id="new-email" className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Rôle</label>
          <Seg<Role> name="new-role" value={role} onChange={setRole} options={[["user", "Utilisateur (consultation)"], ["admin", "Administrateur"]]} />
        </div>
        <p className="small muted" style={{ margin: 0 }}>Un mot de passe provisoire est généré ; il s'affichera après la création et devra être changé à la première connexion.</p>
        {err && <p className="note" style={{ margin: 0 }}>{err}</p>}
      </div>
    </Dialog>
  );
}
