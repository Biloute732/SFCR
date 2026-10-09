// Edge function « admin-users » — gestion des comptes, réservée aux administrateurs.
// Actions : list | create {email, role, password} | set_role {user_id, role}
//           | reset_password {user_id, password} | remove {user_id}
// Les comptes sont créés avec un mot de passe provisoire, à changer à la première connexion
// (aucune dépendance à l'envoi d'e-mails).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["admin", "user"];
const MIN_PASSWORD = 12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Appelant : administrateur uniquement
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return json({ error: "Non autorisé" }, 401);
  const { data: callerRole } = await sb.rpc("user_role", { p_user_id: u.user.id });
  if (callerRole !== "admin") return json({ error: "Accès réservé aux administrateurs" }, 403);
  const me = u.user.id;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vide */ }
  const action = String(body.action ?? "");

  const adminCount = async () => {
    const { count } = await sb.from("app_users").select("user_id", { count: "exact", head: true }).eq("role", "admin");
    return count ?? 0;
  };
  const roleOf = async (id: string) => (await sb.from("app_users").select("role").eq("user_id", id).maybeSingle()).data?.role as string | undefined;
  const checkPassword = (p: unknown) => {
    if (typeof p !== "string" || p.length < MIN_PASSWORD) throw new Error(`Mot de passe provisoire : ${MIN_PASSWORD} caractères minimum`);
    return p;
  };

  try {
    if (action === "list") {
      const { data: rows, error } = await sb.from("app_users").select("*").order("created_at");
      if (error) throw new Error(error.message);
      const out = [];
      for (const r of rows ?? []) {
        const { data: au } = await sb.auth.admin.getUserById(r.user_id);
        out.push({ ...r, last_sign_in_at: au?.user?.last_sign_in_at ?? null, is_me: r.user_id === me });
      }
      return json({ users: out });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const role = String(body.role ?? "user");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Adresse e-mail invalide");
      if (!ROLES.includes(role)) throw new Error("Rôle inconnu");
      const password = checkPassword(body.password);
      const { data: created, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) {
        throw new Error(/already|registered|exists/i.test(error?.message ?? "") ? "Un compte existe déjà pour cette adresse" : (error?.message ?? "Création impossible"));
      }
      const id = created.user.id;
      const { error: e2 } = await sb.from("app_users").upsert({ user_id: id, email, role, must_change_password: true, created_by: me });
      if (e2) { await sb.auth.admin.deleteUser(id); throw new Error(e2.message); }
      await sb.from("user_preferences").upsert({ user_id: id }, { onConflict: "user_id", ignoreDuplicates: true });
      return json({ ok: true, user_id: id });
    }

    const target = String(body.user_id ?? "");
    if (!target) throw new Error("Utilisateur manquant");
    const targetRole = await roleOf(target);
    if (!targetRole) throw new Error("Utilisateur inconnu");

    if (action === "set_role") {
      const role = String(body.role ?? "");
      if (!ROLES.includes(role)) throw new Error("Rôle inconnu");
      if (targetRole === "admin" && role !== "admin" && (await adminCount()) <= 1) throw new Error("Il doit rester au moins un administrateur");
      const { error } = await sb.from("app_users").update({ role }).eq("user_id", target);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const password = checkPassword(body.password);
      const { error } = await sb.auth.admin.updateUserById(target, { password });
      if (error) throw new Error(error.message);
      await sb.from("app_users").update({ must_change_password: target !== me }).eq("user_id", target);
      return json({ ok: true });
    }

    if (action === "remove") {
      if (target === me) throw new Error("Vous ne pouvez pas supprimer votre propre compte");
      if (targetRole === "admin" && (await adminCount()) <= 1) throw new Error("Il doit rester au moins un administrateur");
      // Le compte d'authentification est supprimé ; app_users et préférences suivent (cascade)
      const { error } = await sb.auth.admin.deleteUser(target);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
