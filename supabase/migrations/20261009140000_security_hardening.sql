-- Durcissement de sécurité (audit du 09/10/2026)

-- 1) Plus d'amorçage « premier inscrit = administrateur » : un administrateur existe déjà.
--    Si la table app_users redevenait vide, un inconnu pouvait créer un compte et prendre la main.
--    Les comptes sont désormais créés uniquement par un administrateur (edge function admin-users).
drop trigger if exists on_auth_user_created_claim_owner on auth.users;

-- 2) L'obligation de changer le mot de passe provisoire n'est plus modifiable par l'utilisateur :
--    elle est levée par la base dès que le mot de passe change réellement.
drop policy if exists self_password_flag on public.app_users;

create or replace function private.clear_password_flag() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.app_users set must_change_password = false where user_id = new.id and must_change_password;
  end if;
  return new;
end $$;
create trigger on_auth_user_password_changed after update of encrypted_password on auth.users
  for each row execute function private.clear_password_flag();
-- L'edge function admin-users remet l'indicateur à vrai APRÈS avoir posé un mot de passe provisoire.

-- protect_app_users : un compte connecté ne modifie plus aucune ligne d'app_users (plus de politique UPDATE) ;
-- le déclencheur reste comme seconde barrière, étendu à tous les champs.
create or replace function private.protect_app_users() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'authenticated' then
    raise exception 'Seule la gestion des utilisateurs peut modifier un compte';
  end if;
  return new;
end $$;

-- 3) Il reste toujours au moins un administrateur, même si deux administrateurs agissent au même instant
--    (verrou : les retraits de droits d'administrateur passent l'un après l'autre).
create or replace function private.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    perform pg_advisory_xact_lock(hashtext('app_users_last_admin'));
    if not exists (select 1 from public.app_users where role = 'admin' and user_id <> old.user_id) then
      raise exception 'Il doit rester au moins un administrateur';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger app_users_keep_one_admin before update of role or delete on public.app_users
  for each row execute function private.keep_one_admin();

-- 4) Liens enregistrés : uniquement des adresses web (http ou https)
alter table public.entities
  add constraint entities_caa_pdf_url_http check (caa_pdf_url ~* '^https?://'),
  add constraint entities_caa_page_url_http check (caa_page_url ~* '^https?://');
alter table public.sfcr_documents
  add constraint sfcr_documents_source_url_http check (source_url ~* '^https?://');
alter table public.alerts
  add constraint alerts_url_http check (url ~* '^https?://');
