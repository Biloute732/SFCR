-- Périmètre étendu : réassureurs et captives (registres du CAA) et compagnies ajoutées à la main.
--   source   : caa_sfcr (listes SFCR Vie / Non-Vie / Groupes) | caa_register (registres des entreprises agréées) | manual
--   category : assurance | reassurance | captive
-- Les médianes et le « marché » restent par défaut sur les listes SFCR du CAA (périmètre du PRD).

alter table public.entities add column source text not null default 'caa_sfcr' check (source in ('caa_sfcr', 'caa_register', 'manual'));
alter table public.entities add column category text not null default 'assurance' check (category in ('assurance', 'reassurance', 'captive'));
alter table public.entities add column country text not null default 'LU';
alter table public.entities add column manager text;          -- dirigeant ou gestionnaire (registre CAA)
alter table public.entities add column address text;

alter table public.entities drop constraint if exists entities_caa_list_check;
alter table public.entities add constraint entities_caa_list_check
  check (caa_list in ('vie', 'non-vie', 'groupes', 'registre-reassurance', 'registre-vie', 'registre-non-vie'));

create index if not exists entities_source_idx on public.entities(source, category);
