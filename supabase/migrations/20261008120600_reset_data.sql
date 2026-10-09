-- Réinitialisation depuis l'écran Paramètres (propriétaire uniquement).
--   'extraction' : garde entités et PDF, efface cellules / contrôles / corrections, documents « à extraire »
--   'all'        : efface toutes les données réelles (hors démo), alertes, exécutions, cours BCE
-- security definer : seule cette fonction peut effacer le journal des corrections (aucune politique delete).
create or replace function public.reset_data(p_level text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Accès réservé au propriétaire'; end if;
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
revoke all on function public.reset_data(text) from public, anon;
grant execute on function public.reset_data(text) to authenticated;

-- Le propriétaire peut supprimer les PDF du bucket (réinitialisation complète)
create policy sfcr_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sfcr' and (select public.is_owner()));
