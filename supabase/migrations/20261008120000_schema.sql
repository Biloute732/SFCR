-- Comparateur SFCR Luxembourg — schéma MVP (PRD V2)
-- Stockage : tous les montants en kEUR ; valeur brute et facteur conservés à côté.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Propriétaire unique (outil mono-utilisateur)
-- Le premier compte créé devient propriétaire ; tous les autres sont refusés par la RLS.
-- ─────────────────────────────────────────────────────────────
create schema if not exists private;

create table private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table private.config (
  key text primary key,
  value text not null
);
-- Secret partagé entre pg_cron et l'edge function de collecte planifiée
insert into private.config(key, value) values ('cron_secret', encode(gen_random_bytes(32), 'hex'));

create or replace function private.claim_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.app_owner(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created_claim_owner
  after insert on auth.users for each row execute function private.claim_owner();

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- US1 — Entités
-- ─────────────────────────────────────────────────────────────
create table public.entities (
  id uuid primary key default gen_random_uuid(),
  -- LEI = identifiant unique. Les groupes listés par le CAA n'ont pas toujours de LEI :
  -- clé provisoire « NOLEI:<nom normalisé> » jusqu'à saisie manuelle du LEI.
  lei text not null unique,
  name text not null,
  level text not null check (level in ('Solo', 'Groupe')),
  type text not null check (type in ('Vie', 'Non-Vie', 'Mixte')),
  caa_list text check (caa_list in ('vie', 'non-vie', 'groupes')),
  caa_ratio numeric,                    -- ratio affiché par le CAA (dernier exercice), en %
  caa_pdf_url text,
  caa_page_url text,
  caa_contact text,                     -- ex. adresse e-mail quand l'entreprise n'a pas de site
  successor_id uuid references public.entities(id) on delete set null,
  group_method smallint check (group_method in (1, 2, 3)), -- 3 = combinaison ; groupes uniquement
  list_change text check (list_change in ('new', 'removed')),
  list_change_at timestamptz,
  in_caa_list boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entity_names (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  name text not null,
  seen_at timestamptz not null default now(),
  unique (entity_id, name)
);

-- ─────────────────────────────────────────────────────────────
-- US2/US3 — Documents SFCR (versions)
-- ─────────────────────────────────────────────────────────────
create table public.sfcr_documents (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entities(id) on delete cascade, -- null = import non rattaché
  reference_year int check (reference_year between 2016 and 2100),  -- lu dans le document
  version int not null default 1,
  is_current boolean not null default true,
  storage_path text,
  file_name text,
  file_hash text,
  file_size bigint,
  source_url text,
  origin text not null check (origin in ('caa', 'site', 'import', 'archive')),
  collected_at timestamptz not null default now(),
  status text not null default 'to_extract' check (status in (
    'to_extract',  -- téléchargé, extraction à lancer
    'extracting',
    'unit_pending', -- extrait, unité à valider
    'review',       -- unité validée, cellules en échec
    'validated',
    'error'
  )),
  error text,
  -- Normalisation (US5)
  unit_label text,                 -- 'units' | 'thousands' | 'millions'
  unit_factor numeric,             -- facteur appliqué pour passer en kEUR (hors change)
  currency text default 'EUR',
  fx_rate numeric,                 -- 1 EUR = fx_rate <devise> ; montant_EUR = montant / fx_rate
  fx_date date,
  unit_evidence text,
  unit_evidence_page int,
  unit_detected_explicitly boolean not null default false,
  unit_validated_at timestamptz,
  year_evidence text,
  year_evidence_page int,
  year_confirmed boolean not null default false,
  entity_match_confidence text check (entity_match_confidence in ('lei', 'name', 'manual', 'uncertain')),
  is_scanned boolean not null default false,
  page_count int,
  extracted_at timestamptz,
  extractor_version text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index sfcr_one_current on public.sfcr_documents(entity_id, reference_year)
  where is_current and entity_id is not null and reference_year is not null;
create index on public.sfcr_documents(entity_id, reference_year);
create unique index sfcr_hash_unique on public.sfcr_documents(file_hash) where file_hash is not null;

-- Annexes QRT (PDF ou Excel séparé) rattachées à un SFCR
create table public.sfcr_attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sfcr_documents(id) on delete cascade,
  storage_path text not null,
  file_name text,
  kind text not null check (kind in ('pdf', 'xlsx')),
  created_at timestamptz not null default now()
);

-- Années attendues introuvables / non applicables (US3, écran Collecte)
create table public.sfcr_year_flags (
  entity_id uuid not null references public.entities(id) on delete cascade,
  reference_year int not null,
  flag text not null check (flag in ('not_found', 'not_applicable', 'searching')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (entity_id, reference_year)
);

-- ─────────────────────────────────────────────────────────────
-- US4 — QRT et cellules
-- ─────────────────────────────────────────────────────────────
create table public.qrt_instances (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sfcr_documents(id) on delete cascade,
  qrt_code text not null,                -- ex. S.02.01.02 (nouveaux codes acceptés sans refonte)
  status text not null check (status in ('found', 'missing', 'not_applicable')),
  pages int[] not null default '{}',
  matched_by text check (matched_by in ('code', 'label')),
  language text,
  unit_factor_override numeric,          -- exception d'unité au niveau du QRT
  attachment_id uuid references public.sfcr_attachments(id) on delete set null,
  needs_review boolean not null default false,
  unique (document_id, qrt_code)
);

create table public.qrt_cells (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sfcr_documents(id) on delete cascade,
  qrt_code text not null,
  row_code text not null,                -- R0010
  col_code text not null,                -- C0010
  row_label text,
  raw_text text,                         -- tel que lu : '' (vide), '-', '0', '1 234,5'
  raw_value numeric,                     -- nombre brut (null si vide ou '-')
  is_blank boolean not null default false, -- vide ou '-' : non renseigné, jamais zéro
  is_ratio boolean not null default false, -- ratios et % jamais convertis
  factor numeric,                        -- facteur appliqué (unité × change)
  value_keur numeric,                    -- valeur normalisée (ou ratio tel quel)
  pages int[] not null default '{}',
  check_status text not null default 'ok' check (check_status in ('ok', 'failed', 'corrected')),
  extracted_value numeric,               -- valeur avant toute correction
  unique (document_id, qrt_code, row_code, col_code)
);
create index on public.qrt_cells(qrt_code, row_code, col_code);
create index on public.qrt_cells(document_id) where check_status = 'failed';

-- Liste des filiales d'un groupe (S.32.01.22)
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sfcr_documents(id) on delete cascade,
  member_lei text,
  member_name text not null,
  country text,
  page int
);

-- ─────────────────────────────────────────────────────────────
-- US6 — Contrôles, revue, corrections
-- ─────────────────────────────────────────────────────────────
create table public.control_results (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.sfcr_documents(id) on delete cascade,
  control_code text not null,
  label text not null,
  status text not null check (status in ('passed', 'failed', 'skipped')),
  expected numeric,
  actual numeric,
  tolerance text,
  message text,
  cell_ids uuid[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.control_results(document_id);

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  cell_id uuid not null references public.qrt_cells(id) on delete cascade,
  document_id uuid not null references public.sfcr_documents(id) on delete cascade,
  corrected_at timestamptz not null default now(),
  value_before numeric,
  value_after numeric,
  action text not null check (action in ('correct', 'confirm')),
  reason text not null check (length(trim(reason)) > 0)
);

-- ─────────────────────────────────────────────────────────────
-- Ruptures de méthode (US11)
-- ─────────────────────────────────────────────────────────────
create table public.method_breaks (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  reference_year int not null,
  kind text not null check (kind in ('internal_model', 'merger', 'other')),
  note text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Collecte : exécutions et alertes (US1, US2)
-- ─────────────────────────────────────────────────────────────
create table public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('caa_lists', 'download', 'history', 'scheduled')),
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  status text not null default 'running' check (status in ('running', 'success', 'error', 'partial')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  progress int not null default 0,
  total int,
  summary text,
  log jsonb not null default '[]'
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.collection_runs(id) on delete set null,
  entity_id uuid references public.entities(id) on delete cascade,
  kind text not null check (kind in ('broken_link', 'new_entity', 'removed_entity', 'missing_qrt', 'scanned', 'robots', 'other')),
  message text not null,
  url text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- Cours BCE (US5)
-- ─────────────────────────────────────────────────────────────
create table public.fx_rates (
  currency text not null,
  rate_date date not null,
  rate numeric not null,  -- 1 EUR = rate devise
  primary key (currency, rate_date)
);

-- ─────────────────────────────────────────────────────────────
-- Paramètres (un seul utilisateur)
-- ─────────────────────────────────────────────────────────────
create table public.settings (
  singleton boolean primary key default true check (singleton),
  display_unit text not null default 'kEUR' check (display_unit in ('kEUR', 'MEUR')),
  favorite_indicators text[] not null default '{scr_ratio,own_funds,gwp_nl,gwp_life,total_assets}'
);
insert into public.settings default values;

-- ─────────────────────────────────────────────────────────────
-- Vues
-- ─────────────────────────────────────────────────────────────

-- Cellules utilisables en analyse : SFCR courant, unité validée, cellule hors échec.
create view public.validated_cells with (security_invoker = true) as
select c.*, d.entity_id, d.reference_year, d.source_url, d.origin, d.collected_at, d.storage_path
from public.qrt_cells c
join public.sfcr_documents d on d.id = c.document_id
where d.is_current
  and d.unit_validated_at is not null
  and d.entity_id is not null
  and d.reference_year is not null
  and c.check_status <> 'failed';

-- Statut par entité et par année (écran Compagnies / Collecte)
create view public.entity_year_status with (security_invoker = true) as
select e.id as entity_id, y.year as reference_year,
  d.id as document_id, d.status as doc_status, d.origin, d.source_url, d.collected_at, d.version,
  f.flag,
  case
    when d.status = 'validated' then 'validated'
    when d.status in ('review', 'unit_pending') then 'review'
    when d.status in ('to_extract', 'extracting') then 'collecting'
    when d.status = 'error' then 'error'
    when f.flag = 'not_applicable' then 'not_applicable'
    when f.flag = 'searching' then 'collecting'
    when f.flag = 'not_found' then 'not_found'
    when e.caa_pdf_url is null and e.caa_page_url is null then 'unavailable'
    else 'pending'
  end as year_status
from public.entities e
cross join (values (2023), (2024), (2025)) as y(year)
left join public.sfcr_documents d on d.entity_id = e.id and d.reference_year = y.year and d.is_current
left join public.sfcr_year_flags f on f.entity_id = e.id and f.reference_year = y.year;

-- ─────────────────────────────────────────────────────────────
-- Garde-fous
-- ─────────────────────────────────────────────────────────────

-- Correction tracée : toute modification de valeur d'une cellule passe par une correction motivée.
create or replace function public.apply_correction(p_cell_id uuid, p_value numeric, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare c public.qrt_cells; d public.sfcr_documents; f numeric;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Le motif est obligatoire';
  end if;
  select * into c from public.qrt_cells where id = p_cell_id for update;
  if not found then raise exception 'Cellule introuvable'; end if;
  select * into d from public.sfcr_documents where id = c.document_id;

  insert into public.corrections(cell_id, document_id, value_before, value_after, action, reason)
  values (c.id, c.document_id, c.value_keur, p_value,
          case when p_value is not distinct from c.value_keur then 'confirm' else 'correct' end, p_reason);

  f := coalesce(c.factor, 1);
  update public.qrt_cells set
    value_keur = p_value,
    raw_value = case when c.is_ratio then p_value else p_value / nullif(f, 0) end,
    is_blank = (p_value is null),
    check_status = 'corrected'
  where id = c.id;

  perform public.refresh_document_status(c.document_id);
end $$;

-- Recalcule le statut d'un document à partir de l'unité et des cellules en échec.
create or replace function public.refresh_document_status(p_document_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare d public.sfcr_documents; n_failed int;
begin
  select * into d from public.sfcr_documents where id = p_document_id;
  if d.status in ('to_extract', 'extracting', 'error') then return; end if;
  select count(*) into n_failed from public.qrt_cells where document_id = p_document_id and check_status = 'failed';
  update public.sfcr_documents set status =
    case
      when d.unit_validated_at is null or d.entity_id is null or d.reference_year is null then 'unit_pending'
      when n_failed > 0 then 'review'
      else 'validated'
    end
  where id = p_document_id;
  if n_failed = 0 then
    update public.control_results set resolved_at = coalesce(resolved_at, now())
    where document_id = p_document_id and status = 'failed';
  end if;
end $$;

-- Validation de l'unité en un clic (US6) : applique le facteur à toutes les cellules monétaires.
create or replace function public.validate_unit(p_document_id uuid, p_unit_factor numeric, p_currency text, p_fx_rate numeric)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_unit_factor is null or p_unit_factor <= 0 then raise exception 'Facteur d''unité invalide'; end if;
  if coalesce(p_currency, 'EUR') <> 'EUR' and (p_fx_rate is null or p_fx_rate <= 0) then
    raise exception 'Cours BCE requis pour une devise autre que l''euro';
  end if;
  update public.sfcr_documents set
    unit_factor = p_unit_factor,
    currency = coalesce(p_currency, 'EUR'),
    fx_rate = case when coalesce(p_currency, 'EUR') = 'EUR' then null else p_fx_rate end,
    unit_validated_at = now()
  where id = p_document_id;

  update public.qrt_cells c set
    factor = case when c.is_ratio then 1
                  else p_unit_factor / case when coalesce(p_currency, 'EUR') = 'EUR' then 1 else p_fx_rate end end,
    value_keur = case when c.raw_value is null then null
                      when c.is_ratio then c.raw_value
                      else c.raw_value * p_unit_factor
                           / case when coalesce(p_currency, 'EUR') = 'EUR' then 1 else p_fx_rate end end
  where c.document_id = p_document_id and c.check_status <> 'corrected';

  -- exceptions d'unité par QRT
  update public.qrt_cells c set
    factor = q.unit_factor_override / case when coalesce(p_currency, 'EUR') = 'EUR' then 1 else p_fx_rate end,
    value_keur = c.raw_value * q.unit_factor_override / case when coalesce(p_currency, 'EUR') = 'EUR' then 1 else p_fx_rate end
  from public.qrt_instances q
  where q.document_id = p_document_id and c.document_id = p_document_id
    and q.qrt_code = c.qrt_code and q.unit_factor_override is not null
    and not c.is_ratio and c.raw_value is not null and c.check_status <> 'corrected';

  perform public.refresh_document_status(p_document_id);
end $$;

-- Nouvelle version d'un SFCR pour la même année : l'ancienne reste consultable.
create or replace function public.set_document_current(p_document_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare d public.sfcr_documents; v int;
begin
  select * into d from public.sfcr_documents where id = p_document_id;
  if d.entity_id is null or d.reference_year is null then return; end if;
  select coalesce(max(version), 0) into v from public.sfcr_documents
    where entity_id = d.entity_id and reference_year = d.reference_year and id <> d.id;
  update public.sfcr_documents set is_current = false
    where entity_id = d.entity_id and reference_year = d.reference_year and id <> d.id;
  update public.sfcr_documents set is_current = true, version = v + 1 where id = d.id;
  delete from public.sfcr_year_flags where entity_id = d.entity_id and reference_year = d.reference_year;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger entities_touch before update on public.entities for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- RLS : propriétaire uniquement
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['entities','entity_names','sfcr_documents','sfcr_attachments','sfcr_year_flags',
    'qrt_instances','qrt_cells','group_members','control_results','corrections','method_breaks',
    'collection_runs','alerts','fx_rates','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated using ((select public.is_owner())) with check ((select public.is_owner()))', t);
  end loop;
end $$;

-- Les corrections sont un journal : ni modification ni suppression.
drop policy owner_all on public.corrections;
create policy owner_read on public.corrections for select to authenticated using ((select public.is_owner()));
create policy owner_insert on public.corrections for insert to authenticated with check ((select public.is_owner()));

revoke all on function public.apply_correction(uuid, numeric, text) from public, anon;
revoke all on function public.validate_unit(uuid, numeric, text, numeric) from public, anon;
revoke all on function public.refresh_document_status(uuid) from public, anon;
revoke all on function public.set_document_current(uuid) from public, anon;
grant execute on function public.apply_correction(uuid, numeric, text) to authenticated;
grant execute on function public.validate_unit(uuid, numeric, text, numeric) to authenticated;
grant execute on function public.refresh_document_status(uuid) to authenticated;
grant execute on function public.set_document_current(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Stockage des PDF (bucket privé)
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sfcr', 'sfcr', false, 104857600,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'])
on conflict (id) do nothing;

create policy sfcr_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'sfcr' and (select public.is_owner()));
create policy sfcr_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sfcr' and (select public.is_owner()));
create policy sfcr_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'sfcr' and (select public.is_owner()));
