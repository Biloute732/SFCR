create or replace function public.check_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.config where key = 'cron_secret' and value = p_secret);
$$;
create or replace function public.owner_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from private.app_owner limit 1;
$$;
revoke all on function public.check_cron_secret(text) from public, anon, authenticated;
revoke all on function public.owner_user_id() from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;
grant execute on function public.owner_user_id() to service_role;
