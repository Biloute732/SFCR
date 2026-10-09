-- Jeu de démonstration — entités FICTIVES (is_demo = true), aucun chiffre ne provient d'un SFCR.
-- Sert uniquement à essayer les écrans avant la première collecte réelle.
-- Suppression : écran Paramètres, ou `delete from public.entities where is_demo;` (cascade).
do $$
declare
  ents jsonb := '[
    ["Démo Vie Alpha S.A.","Solo","Vie",1.0],["Démo Vie Bêta S.A.","Solo","Vie",2.3],["Démo Vie Gamma S.A.","Solo","Vie",0.6],
    ["Démo Vie Delta S.A.","Solo","Vie",4.1],["Démo Vie Epsilon S.A.","Solo","Vie",1.7],["Démo Vie Zêta S.A.","Solo","Vie",0.9],
    ["Démo Non-Vie Alpha S.A.","Solo","Non-Vie",0.25],["Démo Non-Vie Bêta S.A.","Solo","Non-Vie",0.6],["Démo Non-Vie Gamma S.A.","Solo","Non-Vie",0.12],
    ["Démo Non-Vie Delta S.A.","Solo","Non-Vie",0.4],["Démo Non-Vie Epsilon S.A.","Solo","Non-Vie",0.18],
    ["Démo Mixte Santé S.A.","Solo","Mixte",0.3],
    ["Démo Groupe Un","Groupe","Mixte",5.5],["Démo Groupe Deux","Groupe","Mixte",2.2],["Démo Groupe Trois","Groupe","Mixte",0.9]
  ]';
  e jsonb; i int := 0; eid uuid; did uuid; v_lei text; y int; yi int;
  lvl text; typ text; scale numeric; g numeric;
  ta numeric; liab numeric; exc numeric; tp_nl numeric; tp_life numeric; tp_ul numeric;
  ofs numeric; scr numeric; mcr numeric; ratio numeric; gwp numeric; nep numeric; claims numeric; exps numeric;
  st text; validated timestamptz;
  procedure_cells jsonb;
  c jsonb; cid uuid;
begin
  if exists (select 1 from public.entities where is_demo) then
    raise notice 'Données de démonstration déjà présentes'; return;
  end if;
  perform setseed(0.42);
  for e in select * from jsonb_array_elements(ents) loop
    i := i + 1;
    lvl := e->>1; typ := e->>2; scale := (e->>3)::numeric * 1000000; -- total bilan en kEUR
    v_lei := 'DEMO' || lpad(i::text, 14, '0') || lpad((i * 7 % 97)::text, 2, '0');
    insert into public.entities(lei, name, level, type, caa_list, caa_ratio, is_demo, list_change)
    values (v_lei, e->>0, lvl, typ, case lvl when 'Groupe' then 'groupes' when 'Solo' then case typ when 'Non-Vie' then 'non-vie' else 'vie' end end,
            null, true, case when i = 5 then 'new' end)
    returning id into eid;
    insert into public.entity_names(entity_id, name) values (eid, e->>0);

    yi := 0;
    foreach y in array array[2023, 2024, 2025] loop
      yi := yi + 1;
      -- 2023 introuvable pour une entité : trou sur les courbes, jamais un zéro
      if i = 3 and y = 2023 then
        insert into public.sfcr_year_flags(entity_id, reference_year, flag, note) values (eid, y, 'not_found', 'Démo : ni site, ni archive web');
        continue;
      end if;
      g := 1 + (yi - 1) * (0.03 + random() * 0.06);
      ta := round(scale * g * (0.95 + random() * 0.1));
      liab := round(ta * (0.86 + random() * 0.06));
      exc := ta - liab;
      tp_nl := case when typ = 'Non-Vie' then round(liab * 0.62) when typ = 'Mixte' then round(liab * 0.35) else 0 end;
      tp_life := case when typ = 'Vie' then round(liab * 0.28) when typ = 'Mixte' then round(liab * 0.40) else 0 end;
      tp_ul := case when typ = 'Vie' then round(liab * 0.58) else 0 end;
      ofs := round(exc * (0.9 + random() * 0.08));
      ratio := 1.3 + random() * 1.4;
      if i = 9 and y = 2025 then ratio := 1.18; end if; -- mouvement notable pour la démo
      scr := round(ofs / ratio);
      mcr := round(scr * (0.3 + random() * 0.1));
      gwp := round(ta * case typ when 'Non-Vie' then 0.45 when 'Mixte' then 0.35 else 0.09 end * (0.9 + random() * 0.2));
      nep := round(gwp * 0.74);
      claims := round(nep * (0.52 + random() * 0.2));
      exps := round(nep * (0.24 + random() * 0.08));

      st := 'validated'; validated := now() - interval '20 days';
      if i = 2 and y = 2025 then st := 'review'; end if;
      if i = 8 and y = 2025 then st := 'unit_pending'; validated := null; end if;

      insert into public.sfcr_documents(entity_id, reference_year, version, is_current, origin, source_url, collected_at, status,
        unit_label, unit_factor, currency, unit_evidence, unit_evidence_page, unit_detected_explicitly, unit_validated_at,
        year_evidence, year_confirmed, entity_match_confidence, page_count, extracted_at, extractor_version, is_demo)
      values (eid, y, 1, true, case when y = 2025 then 'caa' when y = 2024 then 'site' else 'archive' end, null,
        make_date(y + 1, 4, 20)::timestamptz, st, 'thousands', 1, 'EUR', 'Démo : montants en milliers d''euros', 1, true, validated,
        'au 31/12/' || y, true, 'lei', 80, now(), 'demo', true)
      returning id into did;

      procedure_cells := jsonb_build_array(
        jsonb_build_array('S.02.01','R0500','C0010', ta, false), jsonb_build_array('S.02.01','R0510','C0010', tp_nl, false),
        jsonb_build_array('S.02.01','R0600','C0010', tp_life, false), jsonb_build_array('S.02.01','R0690','C0010', tp_ul, false),
        jsonb_build_array('S.02.01','R0900','C0010', liab, false), jsonb_build_array('S.02.01','R1000','C0010', exc, false),
        jsonb_build_array('S.25.01','R0220','C0100', scr, false)
      );
      if lvl = 'Solo' then
        procedure_cells := procedure_cells || jsonb_build_array(
          jsonb_build_array('S.23.01','R0540','C0010', ofs, false), jsonb_build_array('S.23.01','R0540','C0020', round(ofs * 0.86), false),
          jsonb_build_array('S.23.01','R0540','C0030', 0, false), jsonb_build_array('S.23.01','R0540','C0040', ofs - round(ofs * 0.86), false),
          jsonb_build_array('S.23.01','R0580','C0010', scr, false), jsonb_build_array('S.23.01','R0600','C0010', mcr, false),
          jsonb_build_array('S.23.01','R0620','C0010', round(ofs / scr * 100, 2), true), jsonb_build_array('S.23.01','R0640','C0010', round(ofs / mcr * 100, 2), true),
          jsonb_build_array(case when typ = 'Mixte' then 'S.28.02' else 'S.28.01' end,'R0400', case when typ = 'Mixte' then 'C0130' else 'C0070' end, mcr, false)
        );
      else
        procedure_cells := procedure_cells || jsonb_build_array(
          jsonb_build_array('S.23.01','R0660','C0010', ofs, false), jsonb_build_array('S.23.01','R0660','C0020', round(ofs * 0.88), false),
          jsonb_build_array('S.23.01','R0680','C0010', scr, false), jsonb_build_array('S.23.01','R0690','C0010', round(ofs / scr * 100, 2), true)
        );
      end if;
      if typ in ('Non-Vie', 'Mixte') then
        procedure_cells := procedure_cells || jsonb_build_array(
          jsonb_build_array('S.05.01','R0110','C0200', round(gwp * 0.93), false), jsonb_build_array('S.05.01','R0120','C0200', gwp - round(gwp * 0.93), false),
          jsonb_build_array('S.05.01','R0130','C0200', null, false),
          jsonb_build_array('S.05.01','R0200','C0200', round(gwp * 0.76), false), jsonb_build_array('S.05.01','R0300','C0200', nep, false),
          jsonb_build_array('S.05.01','R0400','C0200', claims, false), jsonb_build_array('S.05.01','R0550','C0200', exps, false)
        );
        if lvl = 'Solo' then procedure_cells := procedure_cells || jsonb_build_array(jsonb_build_array('S.17.01','R0320','C0180', tp_nl, false)); end if;
      end if;
      if typ in ('Vie', 'Mixte') then
        procedure_cells := procedure_cells || jsonb_build_array(
          jsonb_build_array('S.05.01','R1410','C0300', round(ta * 0.08), false), jsonb_build_array('S.05.01','R1500','C0300', round(ta * 0.071), false)
        );
        if lvl = 'Solo' then procedure_cells := procedure_cells || jsonb_build_array(jsonb_build_array('S.12.01','R0200','C0150', tp_life + tp_ul, false)); end if;
      end if;

      for c in select * from jsonb_array_elements(procedure_cells) loop
        insert into public.qrt_cells(document_id, qrt_code, row_code, col_code, raw_text, raw_value, is_blank, is_ratio, factor, value_keur, pages, check_status, extracted_value)
        values (did, c->>0, c->>1, c->>2,
          case when c->>3 is null then '-' else c->>3 end,
          (c->>3)::numeric, c->>3 is null, (c->>4)::boolean,
          case when validated is null then null else 1 end,
          case when validated is null then null else (c->>3)::numeric end,
          array[case c->>0 when 'S.02.01' then 60 when 'S.05.01' then 63 when 'S.12.01' then 65 when 'S.17.01' then 66 when 'S.23.01' then 70 when 'S.25.01' then 72 else 74 end],
          'ok', (c->>3)::numeric)
        returning id into cid;
        -- Démo de file de revue : SCR de S.25 incohérent avec S.23.01
        if st = 'review' and c->>0 = 'S.25.01' then
          update public.qrt_cells set raw_value = scr * 1000, value_keur = scr * 1000, extracted_value = scr * 1000, raw_text = (scr * 1000)::text, check_status = 'failed' where id = cid;
          insert into public.control_results(document_id, control_code, label, status, expected, actual, tolerance, message, cell_ids)
          values (did, 'scr_s25_s23', 'SCR de S.25 = SCR repris dans S.23.01', 'failed', scr * 1000, scr, '± 2 kEUR', 'Écart probable d''unité (×1 000)', array[cid]);
        end if;
      end loop;

      insert into public.qrt_instances(document_id, qrt_code, full_code, status, pages, matched_by)
      select did, f, f || case when lvl = 'Groupe' and f in ('S.23.01','S.25.01','S.22.01') then '.22' when f in ('S.23.01','S.28.01','S.28.02') then '.01' when f in ('S.25.01','S.22.01','S.04.05') then '.21' else '.02' end,
             'found', array[60], 'code'
      from (select distinct c2->>0 as f from jsonb_array_elements(procedure_cells) c2) q;
      insert into public.control_results(document_id, control_code, label, status, tolerance)
      values (did, 'balance', 'Bilan S.02.01 : total actif = total passif + excédent', 'passed', '± 2 kEUR'),
             (did, 'ratio_recalc', 'Ratio recalculé (fonds propres éligibles / SCR) = ratio publié', 'passed', '± 1 pts');
    end loop;
    -- Ratio affiché par le CAA = dernier ratio publié
    update public.entities set caa_ratio = (
      select round(value_keur) from public.qrt_cells qc join public.sfcr_documents d on d.id = qc.document_id
      where d.entity_id = eid and d.reference_year = 2025 and qc.qrt_code = 'S.23.01' and qc.row_code in ('R0620','R0690') limit 1)
    where id = eid;
  end loop;

  -- Rupture de méthode et liste de filiales pour la démo
  insert into public.method_breaks(entity_id, reference_year, kind, note)
  select id, 2024, 'internal_model', 'Démo : passage en modèle interne partiel' from public.entities where is_demo and name = 'Démo Vie Bêta S.A.';
  insert into public.group_members(document_id, member_lei, member_name, country, page)
  select d.id, s.lei, s.name, 'LU', 90
  from public.sfcr_documents d join public.entities g on g.id = d.entity_id and g.name = 'Démo Groupe Un'
  cross join (select en.lei, en.name from public.entities en where en.is_demo and en.level = 'Solo' and en.name in ('Démo Vie Alpha S.A.', 'Démo Non-Vie Alpha S.A.', 'Démo Mixte Santé S.A.')) s
  where d.is_demo;
end $$;
