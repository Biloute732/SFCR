-- Cellules validées pour un ensemble de clés « famille|ligne|colonne » en un seul aller-retour (sans limite de 1000 lignes).
create or replace function public.cells_for(p_keys text[], p_entity_ids uuid[] default null, p_years int[] default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  from public.validated_cells v
  where (v.qrt_code || '|' || v.row_code || '|' || v.col_code) = any(p_keys)
    and (p_entity_ids is null or v.entity_id = any(p_entity_ids))
    and (p_years is null or v.reference_year = any(p_years));
$$;
revoke all on function public.cells_for(text[], uuid[], int[]) from public, anon;
grant execute on function public.cells_for(text[], uuid[], int[]) to authenticated;
create index if not exists qrt_cells_key_idx on public.qrt_cells ((qrt_code || '|' || row_code || '|' || col_code));
