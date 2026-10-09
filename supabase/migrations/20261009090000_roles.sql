-- Rôles : administrateur (tout) et utilisateur (consultation et export).
-- Remplace le modèle « propriétaire unique » : le propriétaire actuel devient administrateur.

create table public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'user')),
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

insert into public.app_users(user_id, email, role)
select o.user_id, u.email, 'admin' from private.app_owner o join auth.users u on u.id = o.user_id
on conflict do nothing;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.app_users where user_id = (select auth.uid());
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where user_id = (select auth.uid()));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where user_id = (select auth.uid()) and role = 'admin');
$$;

-- Compatibilité : l'ancien « propriétaire » est désormais un administrateur
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin();
$$;

revoke all on function public.my_role(), public.is_member(), public.is_admin() from public, anon;
grant execute on function public.my_role(), public.is_member(), public.is_admin() to authenticated;

-- Premier compte de la base : administrateur (amorçage). Les suivants sont créés par un administrateur.
create or replace function private.claim_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_users) then
    insert into public.app_users(user_id, email, role) values (new.id, new.email, 'admin');
  end if;
  insert into private.app_owner(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ─── Droits : lecture pour tout membre, écriture pour les administrateurs ───
do $$
declare t text;
begin
  foreach t in array array['entities','entity_names','sfcr_documents','sfcr_attachments','sfcr_year_flags',
    'qrt_instances','qrt_cells','group_members','control_results','method_breaks',
    'collection_runs','alerts','fx_rates','settings']
  loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy member_read on public.%I for select to authenticated using ((select public.is_member()))', t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

drop policy if exists owner_read on public.corrections;
drop policy if exists owner_insert on public.corrections;
create policy member_read on public.corrections for select to authenticated using ((select public.is_member()));
create policy admin_insert on public.corrections for insert to authenticated with check ((select public.is_admin()));

alter table public.app_users enable row level security;
create policy member_read on public.app_users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Écritures sur app_users : uniquement via l'edge function « admin-users » (clé de service), sauf ci-dessous
create policy self_password_flag on public.app_users for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Un utilisateur ne peut modifier que son indicateur de mot de passe, pas son rôle
create or replace function private.protect_app_users() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'authenticated' and (new.role is distinct from old.role or new.user_id is distinct from old.user_id or new.email is distinct from old.email) then
    raise exception 'Seule la gestion des utilisateurs peut modifier un rôle';
  end if;
  return new;
end $$;
create trigger app_users_protect before update on public.app_users for each row execute function private.protect_app_users();

-- Préférences d'affichage propres à chaque utilisateur
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_unit text not null default 'kEUR' check (display_unit in ('kEUR', 'MEUR')),
  favorite_indicators text[] not null default '{scr_ratio,own_funds,gwp_nl,gwp_life,total_assets}'
);
insert into public.user_preferences(user_id, display_unit, favorite_indicators)
select a.user_id, s.display_unit, s.favorite_indicators from public.app_users a cross join public.settings s
on conflict do nothing;
alter table public.user_preferences enable row level security;
create policy own_prefs on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.is_member()));

-- Stockage des PDF : lecture pour les membres, écriture pour les administrateurs
drop policy if exists sfcr_owner_select on storage.objects;
drop policy if exists sfcr_owner_insert on storage.objects;
drop policy if exists sfcr_owner_update on storage.objects;
drop policy if exists sfcr_owner_delete on storage.objects;
create policy sfcr_member_select on storage.objects for select to authenticated
  using (bucket_id = 'sfcr' and (select public.is_member()));
create policy sfcr_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sfcr' and (select public.is_admin()));
create policy sfcr_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'sfcr' and (select public.is_admin()));
create policy sfcr_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sfcr' and (select public.is_admin()));

-- Fonctions d'écriture : réservées aux administrateurs
create or replace function public.reset_data(p_level text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Accès réservé aux administrateurs'; end if;
  if p_level = 'extraction' then
    delete from public.corrections where document_id in (select id from public.sfcr_documents where not is_demo);
    delete from public.control_results where document_id in (select id from public.sfcr_documents where not is_demo);
    delete from public.group_members where document_id in (select id from public.sfcr_documents where not is_demo);
    delete from public.qrt_cells where document_id in (select id from public.sfcr_documents where not is_demo);
    delete from public.qrt_instances where document_id in (select id from public.sfcr_documents where not is_demo);
    update public.sfcr_documents set status = 'to_extract', unit_validated_at = null, extracted_at = null,
      reference_year = null, year_confirmed = false, is_current = false, error = null
      where not is_demo and storage_path is not null;
    delete from public.alerts where kind in ('missing_qrt', 'scanned');
  elsif p_level = 'all' then
    delete from public.entities where not is_demo;
    delete from public.sfcr_documents where not is_demo;
    delete from public.alerts;
    delete from public.collection_runs;
    delete from public.fx_rates;
  else
    raise exception 'Niveau inconnu : %', p_level;
  end if;
end $$;

-- Edge functions (clé de service) : vérification du rôle d'un utilisateur
create or replace function public.user_role(p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.app_users where user_id = p_user_id;
$$;
revoke all on function public.user_role(uuid) from public, anon, authenticated;
grant execute on function public.user_role(uuid) to service_role;
