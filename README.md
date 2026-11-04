# ProspectForge

Outil **privé, mono-administrateur** de prospection locale B2B et de génération de sites de démonstration :
recherche d'entreprises (France, Belgique, Suisse), vérification de leur présence web, enrichissement,
scoring transparent, génération d'un site personnalisé avec démo privée, propositions commerciales,
campagnes email avec relances conditionnelles, boîte de réception classée, CRM, automatisations et analytics.

Pas d'inscription publique, pas de multi-tenant, pas d'abonnements : un seul administrateur.

> État réel du projet (testé / partiel / non vérifiable ici) : voir **[PROGRESS.md](PROGRESS.md)**.

## Démarrage simple sur Mac, sans Docker

Voir le [tutoriel pas à pas](docs/DEMARRAGE-PC.md) : `INSTALLER-MAC.command` une première fois, puis `LANCER-MAC.command`.

## Démarrage rapide (macOS)

```bash
npm run install:macos
```

Le script installe Node 22 et PostgreSQL 16 via Homebrew, crée les bases, installe Chromium pour Playwright,
génère `.env` (secrets aléatoires + mot de passe admin haché), applique les migrations et lance les tests.

Ensuite, dans deux terminaux :

```bash
npm run dev
```

```bash
npm run worker
```

Dashboard : http://localhost:3000. **Le worker est indispensable** : recherches, enrichissements, générations,
captures, envois et relances sont exécutés en tâche de fond (jamais dans une requête HTTP).

### Installation manuelle (Linux / autre)

1. Node ≥ 22, PostgreSQL ≥ 15 avec `pg_trgm`, `unaccent`, `pgcrypto` (contrib standard).
2. `npm ci` puis `npx playwright install chromium`.
3. `cp .env.example .env` et renseigner `DATABASE_URL`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `ADMIN_EMAIL`.
4. Mot de passe admin : `npm run hash-password -- 'votre-mot-de-passe'` → copier la ligne dans `.env`.
5. `npm run migrate`.

### Docker Compose (local ou VPS)

```bash
docker compose up -d --build
```

PostgreSQL + migrations + dashboard (port 3000, lié à 127.0.0.1) + worker (image Playwright). Voir
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Dashboard Next.js |
| `npm run worker` | Worker (file de tâches, planifications, campagnes, reprise sur panne) |
| `npm run migrate` | Applique `db/migrations/*.sql` (idempotent) + données de référence |
| `npm run hash-password -- '…'` | Génère `ADMIN_PASSWORD_HASH` |
| `npm test` | Tests unitaires + intégration (base `prospectforge_test`) |
| `npm run test:e2e` | Parcours de référence complet dans Chromium (base `prospectforge_e2e`, email sandbox) |
| `npm run typecheck` | TypeScript strict |

## Atelier sur mesure, en un clic

Le bouton **Créer le site sur mesure** utilise le skill **Premium 3D Glass** fourni, le dossier du prospect et votre IA pour concevoir une page originale : composition, textes, palette et silhouette de verre unique. Aucun template à sélectionner. L’atelier vérifie les faits, le rendu mobile et la scène WebGL ; une IA manquante est signalée au lieu d’un remplacement par template. Connectez Claude/Codex ou votre fournisseur API une première fois dans Paramètres → IA. Voir [Atelier 3D personnalisé](docs/3D-GLASS.md).

## Vendre et gérer ses démos

Voir le [parcours simple : emails, Stripe, factures et corbeille](docs/VENTES.md). Les paiements sont désactivés tant que le prix unique et Stripe ne sont pas configurés.

Le guide intégré **Aide & prise en main** (`/guide`) explique les quatre étapes. Voir aussi la [navigation et les raccourcis de l’interface](docs/INTERFACE.md).

Les clés de services et les connexions se règlent dans **Paramètres → Clés & connexions** : [mini tutos et configuration](docs/CLES-ET-CONNEXIONS.md). Pour effacer les données tout en conservant l’admin : [remise à zéro avec sauvegarde](docs/REMISE-A-ZERO.md).

## Parcours principal

1. **Recherche de prospects** : pays, ville/code postal (ou coordonnées), rayon, secteur, mots-clés, filtres de présence web.
   Les sources configurées sont interrogées par le worker ; résultats dédoublonnés, enregistrés et scorés.
2. **Fiche prospect** : chaque coordonnée affiche sa source, son statut (publié par une source / non vérifié / invalide)
   et ses dates ; le score est expliqué ligne par ligne.
3. **Créer le site sur mesure** : l’IA conçoit une composition, des textes et une silhouette de verre propres au prospect à partir du skill fourni. Contrôles et captures automatiques ; démo publique `/preview/<jeton>` isolée, noindex, expirable et désactivable. Une connexion IA est requise, sans repli vers un template.
4. **Éditeur** : textes, couleurs, polices, sections, médias sous licence, versions, export ZIP statique.
5. **Proposition** : 8 variantes d'emails fondées uniquement sur les faits vérifiés + lien de démo.
6. **Campagne** : mode manuel / semi-automatique / automatique, plage d'envoi, plafond, séquence de relances.
7. **Boîte de réception** : réponses (IMAP, webhook ou saisie), classées ; relances stoppées ; CRM mis à jour.

## Documentation

- [Architecture et décisions](docs/ARCHITECTURE.md)
- [Connecteurs de données](docs/CONNECTORS.md)
- [API](docs/API.md)
- [Déploiement (VPS, o2switch, Supabase)](docs/DEPLOYMENT.md)
- [Workers et automatisations](docs/WORKERS.md)
- [Sauvegarde et restauration](docs/BACKUP.md)
- [Diagnostic](docs/TROUBLESHOOTING.md)
- [Limitations réelles](docs/LIMITATIONS.md)
- [Avancement et prochaines étapes](PROGRESS.md)

## Conformité

- Données publiques/ouvertes uniquement, avec source et licence conservées par enregistrement (Overture CDLA/ODbL,
  Sirene Licence Ouverte, OSM ODbL). Google Places : seul l'identifiant est conservé (CGU).
- Chaque email contient l'identité de l'expéditeur et un lien de désinscription en un clic (RFC 8058) ;
  liste de suppression globale ; opposition et suppression des données (RGPD) depuis la fiche.
- Les démos sont marquées « Démonstration non officielle » et `noindex` ; elles n'usurpent pas le site du commerce.
- Le contenu généré n'invente ni avis, ni années d'expérience, ni tarifs, ni certifications (garde-fou testé).

### Lots de créations et hébergement client

[Guide Mac, suivi des lots, abonnement o2switch et passage test → production](docs/HEBERGEMENT-ET-MODE-TEST.md).
Le prix mensuel se règle dans le site. Les clés de test et réelles sont conservées séparément.
