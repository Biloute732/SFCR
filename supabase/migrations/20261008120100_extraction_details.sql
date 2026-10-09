alter table public.qrt_instances add column full_code text;
alter table public.sfcr_documents add column detected_lei text;
alter table public.sfcr_documents add column candidate_year int;
alter table public.sfcr_documents add column extraction_log jsonb not null default '[]';
