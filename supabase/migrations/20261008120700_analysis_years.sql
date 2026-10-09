-- Années d'analyse : une seule règle, lue par les écrans, la vue de statut et la collecte.
-- Première année réglable (Paramètres) ; dernière année = dernier exercice publié
-- (exercice N disponible à partir du 1er avril N+1).
alter table public.settings add column first_year int not null default 2023 check (first_year between 2016 and 2100);

create or replace function public.last_published_year(p_today date default current_date) returns int
language sql immutable set search_path = '' as $$
  select case when extract(month from p_today) >= 4 then extract(year from p_today)::int - 1
              else extract(year from p_today)::int - 2 end;
$$;

create or replace function public.analysis_years() returns int[]
language sql stable security invoker set search_path = '' as $$
  select array(select generate_series(
    least(coalesce((select first_year from public.settings limit 1), 2023), public.last_published_year()),
    public.last_published_year()));
$$;
grant execute on function public.analysis_years() to authenticated, service_role;
grant execute on function public.last_published_year(date) to authenticated, service_role;

create or replace view public.entity_year_status with (security_invoker = true) as
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
cross join unnest(public.analysis_years()) as y(year)
left join public.sfcr_documents d on d.entity_id = e.id and d.reference_year = y.year and d.is_current
left join public.sfcr_year_flags f on f.entity_id = e.id and f.reference_year = y.year;
