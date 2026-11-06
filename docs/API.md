# API

Toutes les routes `/api/*` exigent la session administrateur (cookie `pf_session`), sauf mention contraire.
Erreurs : `{ "error": string, "code"?: string, "issues"?: [{ path, message }] }` avec le statut HTTP adapté
(400 validation, 401, 404, 409 conflit, 412 non configuré, 429 budget/limite).

## Authentification
| Méthode | Route | Corps |
|---|---|---|
| POST | `/api/auth/login` (public) | `{ email, password }` — 5 échecs / 15 min / IP |
| POST | `/api/auth/logout` | — |

## Recherche & prospects
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/search/runs` | Lance une recherche (job) → `{ runId, jobId }`. Corps : `searchParamsSchema` (`src/server/search/params.ts`) |
| GET | `/api/search/runs` · `/api/search/runs/:id` | Historique ; état, progression, journaux, workers actifs. Le détail inclut `enrichment: { active, failed, completed }` pour les lots liés à la recherche |
| GET/POST | `/api/saved-searches` · DELETE `/:id` | Recherches enregistrées (+ `cron` optionnel) |
| GET | `/api/prospects?…` | Liste filtrée/paginée (`listFiltersSchema`) |
| GET | `/api/prospects/:id/summary` | Récapitulatif sourcé (`summary`) et présence d’un enrichissement actif (`enriching`). Session administrateur requise |
| GET | `/api/prospects/export?…` | CSV (`;`, UTF-8 BOM, protégé contre l'injection de formules) |
| POST | `/api/prospects/bulk` | `{ ids[], action: enrich|generate_site|add_to_campaign|tag|untag|archive|unarchive|set_status|do_not_contact|rescore|delete }` |
| GET/PATCH/POST | `/api/prospects/:id` | Détail ; édition ; actions (`enrich`, `audit`, `generate_site`, `proposal`, `set_status`, `confirm_no_website`, `add_contact`, `contact_status`, `note`, `task`, `task_done`, `opportunity`, `opportunity_update`, `do_not_contact`, `merge`, `reject_merge`, `delete`) |
| POST | `/api/import/preview` (multipart) · `/api/import/commit` | Analyse + validation à blanc ; import (job) |
| POST | `/api/qualification/rescore` | Recalcule tous les scores |

Les lignes de `/api/prospects` incluent `summary` (activité, avantages annoncés, extraits,
sources, couverture et date) et `enriching`. `POST /api/prospects/:id` avec
`{ "action": "enrich" }` actualise aussi ce récapitulatif dans le traitement en arrière-plan.

## Sites
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/sites/:id[?version=n]` | Site, version, historique, captures |
| PUT | `/api/sites/:id` | `{ config, baseVersion }` → nouvelle version (409 si conflit) |
| POST | `/api/sites/:id` | `restore`, `preview` (activer/désactiver), `extend`, `capture`, `export` (ZIP), `delete` |
| POST | `/api/sites/render` | Rendu HTML d'une configuration (aperçu de l'éditeur) |
| GET | `/preview/:token` (public) | Démo : HTML sans JS, CSP stricte, `noindex`, 404/410 si inconnue, désactivée ou expirée |
| GET | `/api/files/:key…` | Fichiers privés (captures, exports) |

## Campagnes, emails, inbox
| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/api/campaigns` | Liste + statistiques ; création (`campaignInputSchema`) |
| POST | `/api/campaigns/:id` | `status`, `add_prospects`, `approve_prospects`, `remove_prospect`, `approve_message`, `approve_all`, `cancel_message`, `tick`, `autofill` |
| GET | `/api/inbox?filter=attention|unread|all` · `/api/inbox/:id` | Conversations |
| POST | `/api/inbox/:id` | `reply` (envoi explicite), `status`, `reclassify`, `notes` |
| POST | `/api/inbox/manual` | Saisie d'un email reçu (même traitement que IMAP) |
| POST | `/api/webhooks/resend` (public, signé Svix) | Événements de délivrabilité |
| POST | `/api/webhooks/inbound` (public, `Authorization: Bearer INBOUND_WEBHOOK_SECRET`) | `{ from, to?, subject?, text?, messageId?, inReplyTo?, references?, headers? }` |
| GET/POST | `/u/:token` (public) | Désinscription (POST = RFC 8058 one-click) |

## Automatisations, réglages, divers
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/automation` | `flags` (pause globale, arrêt d'urgence), `schedule_create|toggle|delete`, `enqueue`, `retry_failed` |
| GET/POST | `/api/jobs/:id[?action=cancel|retry]` | Tâche + journaux |
| GET/PUT/POST | `/api/settings` | Réglages ; `secret`, `offer_save`, `strategy_save|delete`, `suppress|unsuppress`, `test_email`, `dns_check` |
| POST | `/api/assistant` | `{ message, selection? }` → plan : étapes `read` exécutées, étapes `action` en attente de confirmation (`{ interpreter, note, steps[] }`) |
| POST | `/api/assistant/execute` | `{ tool, input }` — exécute une action confirmée (entrée revalidée côté serveur) |
| GET | `/api/estimate?task=&count=` | Estimation de coût IA avant une opération en lot |
| GET | `/api/connectors` | État des connecteurs |
| GET | `/api/health` (public) | Santé (BD) |

## Lots, progression et hébergement

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/generation-batches` | Lots récents et nombre réel de tâches actives |
| GET/POST | `/api/generation-batches/:id` | Lignes paginées, `retry` ou `cancel_pending`, `jobId` facultatif |
| GET | `/api/progress` | Objectifs réels, XP et niveau de l’atelier |
| GET/POST | `/api/launch` | Contrôles puis changement explicite `mode: test ou live` |
| POST | `/api/billing/credentials` | Paire Stripe pour `mode: test ou live`, secrets masqués |
| GET/PUT/POST | `/api/hosting` | Offre/prix/connexion, enregistrement, test cPanel/FTPS en lecture seule |
| GET/POST | `/api/customer/:token` | Commande payée privée ; `subscribe`, `portal`, `publish`, `domain`, `verify_domain` |
| GET | `/purchase/:token/site` | Aperçu isolé de la version achetée, après paiement |

Les routes administrateur exigent une session ; les mutations hébergement/client/mode exigent
une origine autorisée. L’espace client utilise le jeton privé de la commande payée, sans accès
aux autres commandes ni aux identifiants des fournisseurs. Voir le guide d’hébergement.
