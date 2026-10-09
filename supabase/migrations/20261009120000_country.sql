-- Pays du siège : un des pays soumis à Solvabilité 2 (27 États membres de l'UE + Islande, Liechtenstein, Norvège).
-- Listes et registres du CAA : toujours LU. Ajouts manuels : pays lu dans le registre GLEIF (LEI), modifiable sur la fiche.
-- Filtre pays sur l'accueil, la comparaison et l'évolution ; médiane par pays sur l'écran Comparaison.

alter table public.entities add constraint entities_country_sii_check check (country in (
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'IS', 'LI', 'NO'
));

create index if not exists entities_country_idx on public.entities(country);
