# Comparateur SFCR Luxembourg — FORSIDES

Outil interne à accès par rôles, administrateur et utilisateur (référence : `PRD V4 - Comparateur SFCR Luxembourg.docx`, à la racine du dossier de travail) : collecte des SFCR listés par le CAA, extraction des QRT, normalisation en kEUR, contrôles de cohérence, revue, puis fiche, comparaison, évolution et export Excel.

- **Front** : React 19 + TypeScript + Vite (`web/`), design system Modernist / FORSIDES (`web/src/styles/modernist.css`, copie conforme de `_ds/…/styles.css`).
- **Back** : Supabase (projet `myczeummtuyfvpjosatc`, région eu-west-1) — Postgres + RLS, Storage (bucket privé `sfcr`), Auth, Edge Function `collect`, pg_cron + pg_net, Realtime.

## Démarrer

```bash
cd web
npm install
npm run dev
```

`web/.env.local` contient l'URL du projet et la clé publiable (voir `.env.example`). Aucune clé secrète côté client.

### Premier compte (à faire une fois)

1. Supabase → Authentication → Users → **Add user** (e-mail + mot de passe fort, « Auto confirm »).
   L'amorçage automatique (« premier compte = administrateur », trigger `private.claim_owner`) est **désactivé** depuis la migration `20261009140000_security_hardening` : sur une base neuve, inscrire ce compte comme administrateur dans le SQL Editor :
   `insert into public.app_users(user_id, email, role) select id, email, 'admin' from auth.users where email = '<e-mail>';`
2. Supabase → Authentication → Sign In / Providers → **désactiver « Allow new users to sign up »**.

### Sécurité

- Politique de sécurité du contenu (CSP) posée dans `index.html` par `vite.config.ts` : scripts de l'application seulement, échanges limités à Supabase, GLEIF et aux données de langue de l'OCR (cdn.jsdelivr.net).
- Moteur OCR servi en local (`public/tesseract`, copié depuis `node_modules` par `scripts/copy-tesseract.mjs` avant `dev` et `build`).
- Collecte (`collect`) : adresses web publiques seulement (pas d'IP privée ni de nom interne, redirections revérifiées), fichiers limités à 100 Mo.
- Base : au moins un administrateur garanti (`private.keep_one_admin`), indicateur « mot de passe provisoire » levé par la base au changement de mot de passe, liens enregistrés en http(s) uniquement.

## Écrans (PRD section 6)

| Écran | Route | US |
| --- | --- | --- |
| Login | — | — |
| Compagnies (accueil) | `/` | US1, US7, sélection pour US10 |
| Fiche compagnie | `/compagnies/:id` | US9, US11 (ruptures), US1 (successeur) |
| Détail QRT | `/compagnies/:id/qrt/:qrt` | US4, US12 |
| Comparaison | `/comparaison` | US10, US12 |
| Évolution | `/evolution` | US11 |
| Collecte | `/collecte` | US1, US2, US3 |
| Import en lot | `/import` | US3 |
| File de revue | `/revue/:docId?` | US5, US6 |
| Paramètres | `/parametres` | — |

## Chaîne de données

1. **Listes CAA** (edge function `collect`, action `caa_lists`) : 3 pages lues, LEI = identifiant unique (groupes sans LEI : `NOLEI:<nom>` à compléter sur la fiche), entités apparues / disparues signalées.
2. **Téléchargement** (`download`) : lien direct, sinon page web ; requêtes espacées de 1,5 s par hôte, robots.txt respecté (ex. Foyer interdit `/fr/mydoc/*` → alerte « robots », SFCR à importer à la main) ; un lien cassé n'arrête jamais les autres entités.
3. **Historique 2023–2025** (`history`) : site de la compagnie, puis Wayback Machine (page CAA archivée de l'année suivante).
4. **Extraction** (navigateur, `web/src/lib/extract/`) : pdf.js → QRT par code, cellules R×C, unité / devise / année lues dans le document, OCR tesseract.js si PDF scanné. Voir `docs/addendum-technique.md` (banc d'essai sur 10 SFCR réels).
5. **Contrôles** (`controls.ts`) : bilan, SCR S.25 / S.23, MCR S.28 / S.23, provisions S.12 / S.17 / bilan, ratio recalculé, ratio CAA, variation ×500–×2 000. Échec → cellules en file de revue.
6. **Revue** : unité + devise validées en un clic (cours BCE du 31/12 pour une autre devise), corrections tracées (`corrections`, motif obligatoire, journal non modifiable).
7. **Analyse** : vue `validated_cells` = SFCR courant + unité validée + cellule hors échec. Rien d'autre n'apparaît dans une analyse.

Planification (pg_cron) : 15/04 (solo), 31/05 (groupes), 30/06 (relance). L'extraction des PDF collectés par la planification se lance depuis l'écran Collecte.

## Base de données

Migrations dans `supabase/migrations/` (appliquées sur le projet). Tables principales : `entities`, `sfcr_documents` (versions), `qrt_instances`, `qrt_cells` (valeur brute, facteur, valeur kEUR, pages), `control_results`, `corrections`, `collection_runs`, `alerts`, `method_breaks`, `group_members`, `fx_rates`, `settings`.

## Données de démonstration

`supabase/seed_demo.sql` crée 15 entités **fictives** (« Démo … », `is_demo = true`) pour essayer les écrans. Aucun chiffre ne provient d'un SFCR. Suppression : Paramètres → « Supprimer les données de démonstration ».

## Années d'analyse

Une seule règle, en base (`public.analysis_years()`) : de la **première année** réglée dans Paramètres (2023 par défaut) au **dernier exercice publié**, calculé automatiquement (l'exercice N apparaît le 1er avril N+1). Écrans, vue `entity_year_status` et recherche d'historique (`collect`) la lisent tous. Avant 2023, les SFCR suivent l'ancien règlement 2015/2452 : un avertissement s'affiche et les valeurs sont à vérifier.

## Périmètre : listes SFCR, registres, ajouts manuels

- `entities.source` : `caa_sfcr` (listes SFCR Vie / Non-Vie / Groupes), `caa_register` (registres CSV du CAA : réassurance, assureurs directs Non-Vie et Vie), `manual` (ajout depuis l'accueil).
- `entities.category` : `assurance`, `reassurance`, `captive`. Captive de réassurance = dirigeant société de gestion (Aon, Marsh, SRS…) ; captive directe = assureur agréé absent des listes SFCR. Classement modifiable sur la fiche.
- Les registres ne donnent pas de lien SFCR : import en lot (rattachement par LEI) ou lien saisi sur la fiche, ensuite suivi par la collecte et l'historique.
- La lecture des listes SFCR ne touche jamais aux entités des registres ni aux ajouts manuels ; chaque source signale ses propres apparitions / disparitions.
- `entities.country` : pays du siège, limité aux 30 pays soumis à Solvabilité 2 (UE + Islande, Liechtenstein, Norvège ; contrainte `entities_country_sii_check`). Listes et registres du CAA : `LU`. Ajout manuel : pays (et nom si vide) lu dans le registre public GLEIF dès qu'un LEI complet est saisi, modifiable ; bouton « Lire depuis le LEI » sur la fiche. Liste dans `web/src/lib/countries.ts`.
- Filtre **Pays** commun à l'accueil, la Comparaison et l'Évolution (mémorisé comme le filtre Branche) ; colonne Pays sur l'accueil et dans l'export Excel.
- Médianes : listes SFCR seules par défaut ; sur l'écran Comparaison, choix « toute la base, tous pays » ou un pays (toutes sources).

## Accès : administrateurs et utilisateurs

Table `app_users` (rôle `admin` ou `user`) ; droits appliqués par la RLS : lecture pour tout membre, écriture pour les administrateurs (données, PDF, fonctions de validation et de réinitialisation). Un compte authentifié absent de `app_users` ne voit rien.

- **Administrateur** : tout l'outil + gestion des accès (Paramètres → Utilisateurs et accès).
- **Utilisateur** : consultation, comparaison, évolution, export Excel.
- Création des comptes par l'edge function `admin-users` (clé de service) avec un mot de passe provisoire, à changer à la première connexion : pas de dépendance à l'envoi d'e-mails. Il reste toujours au moins un administrateur.
- Préférences d'affichage par personne (`user_preferences`) ; années d'analyse communes (`settings`, administrateurs).
- À activer dans Supabase → Authentication : désactiver les inscriptions libres, et la protection contre les mots de passe compromis si l'offre le permet.

## Nettoyer la base

Paramètres → **Réinitialiser la base** (confirmation par saisie d'un mot, irréversible) :

- **Refaire l'extraction** : garde entités et PDF, efface cellules, contrôles, corrections et validations d'unité.
- **Tout effacer** : supprime aussi les entités, les SFCR et leurs PDF stockés, alertes, exécutions et cours BCE. Compte, paramètres et données de démo conservés.

Les mêmes opérations existent en SQL dans `supabase/reset.sql` (fonction `public.reset_data`, réservée au propriétaire).

## Décisions à valider

- **Termes facultatifs des sommes** : pour les primes brutes Non-Vie (R0120, R0130) et les provisions techniques (R0510 / R0600 / R0690), une cellule validée « non renseignée » compte pour 0 (affiché dans le détail de la formule). Une lecture stricte du PRD (« une seule cellule manquante, et il reste vide ») laisserait ces indicateurs vides pour la plupart des compagnies.
- **Codes de lignes groupe et S.25** à confronter à la taxonomie EIOPA (PRD section 5) : centralisés dans `web/src/lib/qrt.ts` et `web/src/lib/indicators.ts`.

## Outils

- `npx tsx scripts/bench-extract.ts <pdf…>` : banc d'essai du moteur sur des SFCR locaux.
- `npx tsx scripts/dump-page.ts <pdf> <page…>` : texte positionné d'une page (débogage).
