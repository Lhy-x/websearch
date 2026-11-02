# PROGRESS

_Dernière mise à jour : 2026-11-02._

## Vérifié par exécution

| Élément | Preuve |
|---|---|
| Dashboard démarre (dev et `next build` + `next start`) | build OK ; `/api/health` → `{"ok":true}` |
| Authentification admin, routes protégées | E2E (mauvais mot de passe refusé, puis connexion) ; tests du proxy (401 API, redirection pages, jeton forgé refusé) |
| Migrations | `npm run migrate` sur 3 bases ; idempotent |
| **Recherche réelle** | Overture release 2026-10-21 : Rouen 10 km coiffeurs → 337 fiches → 330 établissements en ~10–14 s ; aussi dans l'E2E |
| Sauvegarde des prospects, provenance, déduplication | tests d'intégration (ré-exécution idempotente, fusion multi-source, revue des cas ambigus) ; 14 doublons ambigus sur 330 sur données réelles |
| Scoring | tests unitaires (déterminisme, pondérations, opposition) |
| Enrichissement (crawl, emails obfusqués), audit Playwright, anti-SSRF | serveur HTTP local (score 75 vs 23 avec 6 défauts détectés ; SSRF bloqué) |
| Génération de site (déterministe), 15 templates / 7 structures, garde-fou anti-invention | tests + captures desktop/mobile de tous les templates |
| Démo publique (noindex, sans JS, désactivable, expirable) | E2E + tests d'intégration |
| Édition + versions + conflit | E2E (v1 → v2, aperçu en direct) + intégration |
| Export ZIP, captures automatiques | captures générées par le worker pendant l'E2E (desktop, mobile, pleine page, miniature) |
| Proposition commerciale (8 variantes, lien de démo) | E2E + intégration |
| Campagne : création, validation manuelle, envoi via le fournisseur (sandbox), identifiant d'envoi | E2E + intégration |
| Pas de double envoi ; plafond ; plage horaire ; arrêt d'urgence ; retry/échec fournisseur | intégration |
| Réponse traitée → Inbox, classification, CRM, relances arrêtées | E2E (saisie) + intégration (In-Reply-To) |
| Désinscription / opposition / rebond → suppression globale | intégration |
| File de tâches : idempotence, concurrence, backoff, reprise après crash, planifications | intégration |
| Sauvegarde `pg_dump` | exécutée (fichier .sql.gz produit) |
| Coûts API suivis | `api_usage` alimenté par chaque appel IA (non exercé faute de clé) |

Commandes : `npm test` (81 tests), `npm run test:e2e` (parcours de référence, ~1 min), `npm run typecheck`.

## Partiel / non vérifiable ici

Voir [docs/LIMITATIONS.md](docs/LIMITATIONS.md) : Sirene, OSM, Google Places, IA, Resend/SMTP/IMAP, DNS (MX/SPF/DKIM/DMARC),
Docker Compose — implémentés, non exécutés contre les vrais services faute d'accès réseau/clé.

## Critères de validation (§23)

- [x] Le dashboard démarre
- [x] L'authentification fonctionne
- [x] La base de données est connectée
- [x] Les migrations passent
- [x] Une recherche réelle fonctionne (Overture)
- [x] Les prospects sont sauvegardés
- [x] La déduplication fonctionne
- [x] Le scoring fonctionne
- [x] Les fiches peuvent être enrichies (vérifié en local ; sites réels non joignables ici)
- [ ] Un site peut être généré **par IA** — implémenté, non exécuté (pas de clé) ; génération déterministe vérifiée
- [x] La preview fonctionne
- [x] Le site est éditable
- [x] Le site peut être exporté
- [x] Une campagne peut être créée
- [ ] Un email de test envoyé via un **vrai** fournisseur — vérifié avec le fournisseur sandbox seulement
- [x] Une réponse de test est traitée
- [x] Le CRM est mis à jour
- [x] Les relances respectent les conditions
- [x] Les automatisations sont persistantes
- [x] Les logs sont consultables
- [x] Les coûts des API sont suivis (mécanisme en place ; aucun appel payant effectué)
- [x] Les tests critiques passent
- [~] Le système peut être déployé — build de production OK ; Docker Compose non exécuté ici
- [x] Les fonctions non terminées sont explicitement signalées

## Décisions d'architecture

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : TypeScript partout (worker Node), lecture GeoParquet Overture via
hyparquet (pas d'extensions DuckDB à télécharger), file de tâches PostgreSQL au lieu de Redis/RQ, auth locale
mono-admin, base compatible Supabase (RLS activée), rendu statique des sites partagé (preview / export / captures).

## Pour continuer

```bash
npm ci && npx playwright install chromium
cp .env.example .env    # puis secrets + ADMIN_* (npm run hash-password -- '…')
npm run migrate
npm run dev             # terminal 1
npm run worker          # terminal 2
npm test && npm run test:e2e
```

## Prochaines tâches prioritaires

1. Sur votre machine : configurer une clé IA, Resend (ou SMTP) + IMAP, puis valider un envoi réel vers votre propre adresse et une génération IA.
2. Index local des localités Overture (thème *divisions*) pour un géocodage hors ligne complet.
3. Agent IA d'assistance (§26 G) branché sur les fonctions serveur existantes, avec confirmation des actions sensibles.
4. Adaptateur de stockage S3/Supabase et publication sur hébergement/domaine client.
5. Intégration Lighthouse optionnelle dans l'audit.
