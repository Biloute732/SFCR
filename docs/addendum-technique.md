# Addendum technique — moteur d'extraction des QRT

PRD V2, section 7 : « Le moteur d'extraction des tableaux PDF est choisi et testé sur 10 SFCR réels (formats variés, dont un scanné) avant le reste du développement ; le choix est documenté dans un addendum technique. »

## Choix

| Brique | Choix | Pourquoi |
| --- | --- | --- |
| Lecture du PDF | `pdfjs-dist` (Mozilla pdf.js), texte positionné | Exécuté dans le navigateur : pas de limite CPU d'edge function, le PDF ne quitte pas l'infrastructure Supabase |
| Repérage des tableaux | Algorithme maison sur les codes QRT : `S.xx.xx.xx` (QRT), `R0010` (lignes), `C0010` (colonnes) | Les codes sont imprimés dans les QRT publics du règlement 2023/895 et ne dépendent pas de la langue |
| PDF scanné | `tesseract.js` (OCR eng + fra + deu), mots positionnés réinjectés dans le même algorithme | Même chaîne que les PDF natifs ; le SFCR entier part en revue (PRD US4) |
| Annexe Excel | SheetJS 0.20.3 (CDN officiel SheetJS, version corrigée) | Feuille par QRT, codes R/C lus dans les cellules |
| Collecte | Edge function Deno `collect` (Supabase) | Contourne le CORS, espace les requêtes, respecte robots.txt |

### Règles du moteur (`web/src/lib/extract/extractor.ts`)

- Les éléments de texte sont regroupés en lignes ; une ligne contenant un code `R…` est une ligne de QRT, une ligne composée surtout de codes `C…` est un en-tête de colonnes.
- Chaque montant est rattaché à la colonne dont il est le plus proche (pondéré vers le bord droit, les montants étant alignés à droite).
- En-tête incomplet (codes C non imprimés) : la série est prolongée de 10 en 10 avec le même pas.
- Code R et montant imprimés à des hauteurs différentes (libellé sur plusieurs lignes) : le montant d'une ligne voisine sans code est rattaché.
- Tableau coupé sur deux pages : l'en-tête et le QRT courant sont reportés ; le QRT garde la liste des pages.
- Vide, « - » et « 0 » sont distingués (`is_blank`, `raw_text`).
- Ratios (`S.23.01 R0620/R0640…`) : jamais convertis ; un ratio imprimé en décimal (1,94) est exprimé en % (194).
- QRT sans codes R/C : rapprochement par libellé FR / EN / DE pour les lignes clés, QRT en revue.
- Unité : mentions « in thousands », « EUR k », « €000 », « en milliers », « in Tausend »… pondérées ×5 sur les pages de QRT ; puis deux garde-fous : montants imprimés au centime → euro proposé ; total bilan converti hors de [1 M€ ; 500 Md€] → unité plausible proposée. Dans tous les cas l'unité reste à valider (US6).
- Année : « au 31/12/2025 », « 31 December 2025 », « December 31, 2025 », « Geschäftsjahr 2025 »… lue dans le document, jamais dans le nom du fichier.

## Banc d'essai — 10 SFCR réels (exercice 2025, liens du CAA, octobre 2026)

Commande : `npx tsx scripts/bench-extract.ts <pdf…>` (dans `web/`).

| SFCR | Langue / format | Pages | QRT repérés | Unité retenue | Contrôles |
| --- | --- | --- | --- | --- | --- |
| La Luxembourgeoise (Non-Vie) | FR, montants au centime | 68 | 6 | euro (centimes) | 5/5 OK |
| AXA Assurances Luxembourg | EN, gabarit CAA | 98 | 9 | euro (« Balance sheet in EUR ») | 5/6 — écart S.12 vs bilan Vie (−866 kEUR, cellule en revue) |
| ERGO Life | DE, « Tsd. € » | 69 | 11 | milliers | 4/4 OK |
| Hiscox | EN, « €000 » | 75 | 7 | milliers | 5/5 OK |
| La Luxembourgeoise Group | FR, groupe | 65 | 5 (dont S.32.01) | euro (centimes) | 3/3 OK, 5 filiales |
| DKV Luxembourg | FR, en-tête C partiel | 67 | 8 | euro (centimes) | 5/5 OK |
| Colonnade Group | EN, groupe, EUR'000 | 40 | 6 (dont S.32.01) | milliers | 3/3 OK, 5 filiales |
| Generali Luxembourg | FR, « (en €) » | 85 | 7 | euro | 1/2 — S.23.01 publié tronqué (R0290) : SCR, MCR, ratio absents → en revue |
| CNP Luxembourg | FR, sans mention d'unité | 61 | 8 | euro (plausibilité du total bilan) | 5/5 OK |
| The OneLife Company | EN, séparateurs anglo-saxons | 81 | 8 | euro | 5/5 OK |

Temps de lecture + extraction : 0,3 à 1,4 s par SFCR (Node 24, poste de travail).

Constats :

- Les cellules clés du dictionnaire (total bilan, excédent, fonds propres éligibles, SCR, MCR, ratios, primes) sont lues correctement sur les 10 documents ; les écarts restants sont des cas que le PRD envoie en revue (QRT tronqué, incohérence publiée).
- **PDF scanné non testé** : aucun SFCR scanné ne figure dans les listes CAA actuelles. La chaîne OCR (tesseract.js) est branchée mais doit être éprouvée sur un vrai scan avant le lancement — c'est le 10ᵉ cas « scanné » exigé par le PRD.
- Les codes de lignes des QRT groupe (`S.23.01.22` R0660 / R0680 / R0690) et de `S.25.01.21` (R0220 C0100 / C0110) sont centralisés dans `web/src/lib/qrt.ts` et `indicators.ts` et doivent être confrontés à la taxonomie EIOPA en vigueur (PRD section 5).

## Points de vigilance

- Extraction côté navigateur : un SFCR collecté par la planification (pg_cron) reste « à extraire » jusqu'à l'ouverture de l'écran Collecte (bouton « Extraire N PDF en attente »).
- Les liens CAA de Foyer, Foyer Vie, Wealins, Raiffeisen Vie, Foyer-ARAG et Foyer Global Health pointent vers la même page documentaire : la collecte prend le PDF le plus récent de la page, et le rattachement est confirmé par le LEI ou le nom lu dans le document (sinon cas incertain dans Import en lot).
- Les groupes listés par le CAA n'ont pas de LEI : clé provisoire `NOLEI:<nom>`, LEI à saisir sur la fiche.
