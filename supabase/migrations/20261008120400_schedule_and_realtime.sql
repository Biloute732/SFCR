create extension if not exists pg_net schema extensions;
create extension if not exists pg_cron;

-- Appel de l'edge function de collecte, authentifié par le secret partagé (jamais exposé au client)
-- Remplacer l'URL du projet si la base est restaurée ailleurs.
create or replace function private.trigger_scheduled_collection() returns bigint
language plpgsql security definer set search_path = '' as $$
declare secret text; req bigint;
begin
  select value into secret from private.config where key = 'cron_secret';
  select net.http_post(
    url := 'https://myczeummtuyfvpjosatc.supabase.co/functions/v1/collect',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('action', 'scheduled'),
    timeout_milliseconds := 150000
  ) into req;
  return req;
end $$;
revoke all on function private.trigger_scheduled_collection() from public;

-- Échéances PRD : mi-avril (solo), fin mai (groupes), relance mensuelle jusqu'à fin juin
select cron.schedule('sfcr-collecte-solo', '0 6 15 4 *', 'select private.trigger_scheduled_collection()');
select cron.schedule('sfcr-collecte-groupes', '0 6 31 5 *', 'select private.trigger_scheduled_collection()');
select cron.schedule('sfcr-relance-juin', '0 6 30 6 *', 'select private.trigger_scheduled_collection()');

-- État de collecte toujours visible : diffusion temps réel
alter publication supabase_realtime add table public.collection_runs;
alter publication supabase_realtime add table public.sfcr_documents;
