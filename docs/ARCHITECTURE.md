# Architecture

```
                ┌──────────────── navigateur (admin) ────────────────┐
                │ Next.js App Router · React 19 · Tailwind · TanStack │
                └───────────────┬────────────────────────────────────┘
                                │ HTTPS (cookie de session JWT HS256)
┌───────────────────────────────▼───────────────────────────────────────┐
│ Next.js (dashboard + API)  src/app, src/proxy.ts                       │
│  · pages serveur (lecture BD)  · routes /api (Zod, adminRoute)         │
│  · /preview/<jeton> (public, HTML statique, CSP stricte, noindex)      │
│  · /u/<jeton> (désinscription)  · /api/webhooks/* (Resend, entrant)    │
└───────────────┬───────────────────────────────────────▲───────────────┘
                │ INSERT automation_jobs                 │ lecture
┌───────────────▼───────────────────────────────────────┴───────────────┐
│ PostgreSQL : données + file de tâches + planifications + journaux      │
└───────────────▲───────────────────────────────────────────────────────┘
                │ SELECT … FOR UPDATE SKIP LOCKED
┌───────────────┴───────────────────────────────────────────────────────┐
│ Worker Node (src/worker/main.ts, src/server/jobs)                      │
│  · recherche (Overture GeoParquet via HTTP range, Sirene, OSM, Google) │
│  · enrichissement (crawl SSRF-safe, MX), audit Playwright, captures    │
│  · génération IA / déterministe, propositions                          │
│  · planificateur de campagnes, envois (sandbox/Resend/SMTP), IMAP      │
│  · cron (planifications), reprise des tâches orphelines, sauvegardes   │
└───────────────────────────────────────────────────────────────────────┘
```

## Décisions et écarts assumés par rapport à la stack suggérée

| Suggestion | Choix | Raison |
|---|---|---|
| Python + FastAPI + RQ pour les traitements | **TypeScript partout** (worker Node) | Un seul langage : schémas Zod, scoring, rendu des sites et clients email partagés entre UI, API et worker. Tous les besoins (parquet, Playwright, IMAP, DNS) ont des bibliothèques Node matures. |
| DuckDB + GeoParquet | **hyparquet** (lecteur parquet pur JS) sur le GeoParquet officiel Overture | DuckDB doit télécharger ses extensions (`httpfs`, `spatial`) depuis extensions.duckdb.org à l'exécution, ce qui échoue sur les hébergements/réseaux restreints. hyparquet lit uniquement les pieds de fichiers puis les *row groups* dont les statistiques `bbox` intersectent la zone (≈ 5 row groups / 25 Mo pour Rouen 10 km au lieu de 12 Go). Mesuré : 337 établissements en ~10 s. |
| Redis + RQ | **File de tâches PostgreSQL** (`SKIP LOCKED`) | Persistante par construction (aucune tâche ne vit en mémoire), transactionnelle avec les données, idempotente (clé unique), une dépendance de moins à héberger. Débit largement suffisant pour un utilisateur. |
| Supabase Auth | **Auth locale mono-admin** (scrypt + JWT HS256 en cookie httpOnly) | Aucune dépendance à un projet Supabase ; la base reste compatible Supabase (RLS activée sur toutes les tables sans politique : les rôles `anon`/`authenticated` n'ont aucun accès, le serveur se connecte avec le rôle propriétaire). |
| Supabase Storage | **Stockage disque** (`STORAGE_DIR`) avec clés validées | Simple, sauvegardable ; abstraction `src/server/core/storage.ts` remplaçable par S3/Supabase. |
| shadcn/ui CLI | Composants écrits à la main dans le même esprit (Radix + Tailwind + cva) | Le registre shadcn n'est pas joignable depuis tous les environnements ; résultat équivalent et maîtrisé. |
| — | **Next.js 16** | `middleware.ts` y est renommé `proxy.ts` ; `react-dom/server` ne peut pas être importé statiquement dans l'App Router : le rendu statique des sites est chargé à l'exécution (Node uniquement), voir `src/server/sites/html.tsx`. |

## Modules (src/server)

- `core/` : env (Zod), db (postgres.js), réglages (Zod, secrets chiffrés AES-256-GCM), normalisation, géo, `safe-fetch` (anti-SSRF), stockage, audit log.
- `connectors/` : un connecteur = `status()` + `search()` → `RawPlace[]` avec source, licence, identifiant.
- `search/` : géocodage (api-adresse → Nominatim → table intégrée), dédoublonnage (`dedup.ts`), persistance (`run-search.ts`).
- `business/` : contacts avec provenance, `recomputeBusiness()` (présence web + score), fusion manuelle.
- `enrich/` : crawl du site officiel, MX, audit Playwright, classification de présence web.
- `scoring/` : score déterministe pondéré et expliqué.
- `ai/` : client multi-fournisseurs (Anthropic SDK, OpenAI/OpenRouter via HTTP), sorties structurées validées par Zod, budget journalier, coût par appel.
- `sites/` : faits vérifiés → configuration (déterministe et/ou IA) → garde-fou anti-invention → versions → rendu HTML/ZIP/captures.
- `proposals/`, `campaigns/`, `email/` : rédaction, séquences, envoi atomique, événements, réponses entrantes, suppression.
- `jobs/` : file, handlers, runner, planifications, sauvegardes.
- `analytics/` : requêtes du dashboard et des analytics.
- `assistant/` : registre d'outils (`tools.ts`, entrées Zod, `read` / `action`), planification par IA (tool use, `ai-plan.ts`) ou par règles (`rules.ts`), orchestration (`service.ts`). Le modèle ne fait que **planifier** : les résultats affichés viennent toujours de l'exécution des outils, jamais du texte du modèle ; les actions sont prévisualisées puis exécutées sur confirmation.

## IA par abonnement et sites « sur mesure »

**Fournisseurs par abonnement** (`src/server/ai/cli.ts`) : `claude-code` exécute `claude -p --output-format json --tools "" --json-schema …`
(Claude Pro/Max, connexion OAuth du CLI — `--bare` n'est jamais utilisé car il désactive cette connexion) ; `codex` exécute
`codex exec --sandbox read-only --ephemeral --output-schema … -o …` (ChatGPT). Aucun outil n'est donné au modèle, le
répertoire de travail est un dossier temporaire vide, la sortie est contrainte par schéma puis revalidée par Zod. Coût
enregistré : 0 $ ; garde-fou : nombre d'appels par jour (Paramètres → IA).

**Génération sur mesure** (`src/server/sites/bespoke/`) :

```
faits vérifiés (+ texte publié sur le site actuel, horaires, réseaux, année Sirene…)
   └─ prompt = guide anthropics/skills « frontend-design » (Apache-2.0, vendor/) + règles non négociables
        └─ IA : plan de design (palette, typo, layout, signature, révisions) + HTML complet sans JS
             └─ sanitisation (allowlist : pas de script/formulaire/iframe hors OSM/image non licenciée)
                  └─ contrôles de faits (téléphone/email inventés, affirmations, H1, nom…)
                       └─ rendu mesuré dans Chromium 390 px et 1440 px (débordement, texte minuscule, cibles tactiles)
                            └─ passe(s) de correction alimentée(s) par les problèmes mesurés (0–3, réglable)
                                 └─ rejet si une information inventée subsiste (mode auto : repli sur un template)
```

Le bandeau « Démonstration non officielle », le `noindex` et la mention de démonstration sont ajoutés par
l'application, jamais laissés au modèle. L'aperçu public envoie en plus une CSP sans `script-src`.

## Données

Schéma : `db/migrations/0001_init.sql` (+ 0002, 0003). Points clés :

- Toute valeur collectée garde sa **source** (`business_sources`, `business_contacts.source/source_url`, `business_enrichments`), ses **dates** de récupération/vérification et un **niveau de confiance**.
- `businesses.web_presence_evidence` : observations par source (site listé, aucun site, uniquement annuaire, vérification en direct, confirmation manuelle).
- `prospect_scores` : historique des scores avec raisons et pondérations utilisées.
- `outbound_messages` : index unique `(campaign_prospect_id, step)` + `idempotency_key` → aucun double envoi possible.
- `automation_jobs` : statut, priorité, tentatives, `run_at` (backoff), `heartbeat_at` (reprise sur panne), `idempotency_key`.

## Règles « pas de faux »

- Présence web : un champ site vide d'**une** source ne prouve rien. `NO_WEBSITE_CONFIRMED` exige deux sources indépendantes capables de publier un site dont une vérification en direct (Google Places, crawl), ou une confirmation manuelle (`src/server/enrich/presence.ts`).
- Emails : « publié par une source » ≠ « boîte vérifiée ». Un MX valide n'est jamais présenté comme preuve d'existence.
- Sites et emails générés : seules les données de `BusinessFacts` sont utilisées ; les coordonnées sont réimposées après l'IA (`enforceFacts`) ; tout champ IA contenant une affirmation invérifiable (années, avis, prix, labels, superlatifs) est rejeté et remplacé (`FORBIDDEN_CLAIMS`).
- IA ou fournisseur non configuré → erreur explicite « Non configuré », jamais de résultat simulé. Le fournisseur email `sandbox` est clairement signalé dans l'interface.
- Contenus externes (pages web, emails reçus) passés à l'IA uniquement comme données balisées, avec consigne d'ignorer toute instruction qu'ils contiennent.
