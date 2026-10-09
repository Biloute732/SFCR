-- Nettoyage de la base — à exécuter dans Supabase → SQL Editor.
-- Choisir UN niveau, l'exécuter seul. Irréversible : aucune corbeille.
-- Ne touche jamais au compte propriétaire, aux paramètres ni à la planification pg_cron.

-- ─────────────────────────────────────────────────────────────
-- Niveau 1 — Données de démonstration seulement
-- (équivalent du bouton Paramètres → « Supprimer les données de démonstration »)
-- ─────────────────────────────────────────────────────────────
-- delete from public.entities where is_demo;


-- ─────────────────────────────────────────────────────────────
-- Niveau 2 — Repartir de zéro sur l'extraction, en gardant les entités et les PDF collectés
-- Les documents repassent « à extraire » ; corrections et contrôles sont effacés.
-- ─────────────────────────────────────────────────────────────
-- begin;
-- delete from public.corrections where document_id in (select id from public.sfcr_documents where not is_demo);
-- delete from public.control_results where document_id in (select id from public.sfcr_documents where not is_demo);
-- delete from public.group_members  where document_id in (select id from public.sfcr_documents where not is_demo);
-- delete from public.qrt_cells      where document_id in (select id from public.sfcr_documents where not is_demo);
-- delete from public.qrt_instances  where document_id in (select id from public.sfcr_documents where not is_demo);
-- update public.sfcr_documents set status = 'to_extract', unit_validated_at = null, extracted_at = null,
--   reference_year = null, year_confirmed = false, is_current = false, error = null
--   where not is_demo and storage_path is not null;
-- commit;


-- ─────────────────────────────────────────────────────────────
-- Niveau 3 — Tout effacer (entités, documents, cellules, alertes, historique de collecte, cours BCE)
-- Les fichiers PDF restent dans le bucket : les vider ensuite via Storage → sfcr → tout sélectionner → Delete.
-- ─────────────────────────────────────────────────────────────
-- begin;
-- delete from public.entities;          -- cascade : documents, cellules, QRT, contrôles, corrections, ruptures, filiales
-- delete from public.sfcr_documents;    -- imports non rattachés à une entité
-- delete from public.alerts;
-- delete from public.collection_runs;
-- delete from public.fx_rates;
-- commit;
