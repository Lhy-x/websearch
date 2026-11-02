# Connecteurs de données

Activation par défaut : Paramètres → Recherche. Chaque recherche affiche l'état de chaque source (ok / ignorée / erreur) ; une source en erreur n'empêche pas les autres.

| Source | Clé | Couverture | Champs | Licence / règles |
|---|---|---|---|---|
| **Overture Maps — places** | aucune | Monde | nom, catégorie (taxonomie 2026), adresse, coordonnées, sites, téléphones, emails, réseaux, confiance, statut d'activité | CDLA-Permissive-2.0 / ODbL selon la source amont (conservée par fiche) |
| **Sirene — API Recherche d'entreprises** (`recherche-entreprises.api.gouv.fr`) | aucune | France | SIREN/SIRET, NAF, enseigne, adresse, coordonnées, état administratif | Licence Ouverte 2.0 ; seuls les établissements diffusibles sont renvoyés ; ~7 req/s |
| **OpenStreetMap (Overpass)** | aucune (`OVERPASS_URL`) | Monde | nom, tags métier, adresse, site, téléphone, email, horaires | ODbL. Désactivé par défaut : l'instance publique a une politique d'usage raisonnable ; utilisez votre instance pour un usage régulier |
| **Google Places (API New)** | `GOOGLE_PLACES_API_KEY` | Monde | découverte + vérification en direct du site | CGU Google : **seul le place_id est conservé** ; le contenu n'est pas stocké |
| **Import** CSV / JSON / XLSX | — | — | mapping de colonnes, validation ligne par ligne | 10 Mo / 20 000 lignes max |

## Overture

- Release détectée automatiquement (`OVERTURE_RELEASE` pour figer).
- Lecture HTTP par plages : pieds parquet (~2 s par fichier, en parallèle) puis uniquement les row groups dont les statistiques `bbox` recoupent la zone. Les métadonnées sont mises en cache en mémoire dans le worker.
- Correspondance secteurs : `src/lib/sectors.ts` (valeurs `taxonomy.primary`, codes NAF, tags OSM). Les sites de plateformes (Planity, Facebook, Treatwell, PagesJaunes…) ne sont pas considérés comme un site propre (`isThirdPartyHost`).

## Géocodage

`api-adresse.data.gouv.fr` (France) → Nominatim (BE/CH, User-Agent avec `CRAWLER_CONTACT`) → table intégrée de ~140 villes (approximatif, signalé). Saisir des coordonnées court-circuite le géocodage. Résultats en cache (`geocode_cache`).

## Déduplication

`src/server/search/dedup.ts` — score explicable : similarité des noms (mots génériques du secteur et nom de ville retirés), distance, téléphone normalisé E.164, domaine propre, SIRET.

- `MERGE` automatique : SIRET identique ; téléphone/domaine identique à < 1 km avec noms proches ; noms quasi identiques à < 120 m.
- `REVIEW` (jamais fusionné automatiquement) : cas ambigus → Qualification / fiche prospect.
- Les succursales d'une chaîne (même domaine, loin) restent distinctes.
- Historique : `business_merges`, sources d'origine conservées.

## Enrichissement

Par prospect (job `business.enrich`) : **vérification en direct Google Places** si une clé est configurée (la fiche Google doit correspondre au prospect — nom, position, téléphone ; « absent de Google » n'est jamais une preuve ; seul le place_id est conservé ; coût estimé enregistré dans `api_usage`), crawl du site officiel (accueil + 3 pages contact/mentions/à propos, sans soumission de formulaire), emails (y compris `[at]`/`[dot]`), réseaux sociaux, téléphones ; vérification syntaxe + MX (si DNS disponible) ; observation de présence ; audit Playwright si un site existe ; recalcul du score.

## Ajouter un connecteur

Implémenter `Connector` (`src/server/connectors/types.ts`), l'ajouter à `CONNECTORS`, ajouter la source dans le `check` de `business_sources.source` (migration) et dans `searchParamsSchema.sources`.
