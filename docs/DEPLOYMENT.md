# Déploiement

Le produit a deux processus : le **dashboard** (Next.js, requêtes HTTP) et le **worker** (processus permanent :
file de tâches, planifications, campagnes, Playwright). Les deux partagent PostgreSQL et le répertoire `STORAGE_DIR`.

## Option recommandée : un petit VPS (2 vCPU / 4 Go)

```bash
git clone <dépôt> prospectforge && cd prospectforge
cp .env.example .env   # renseigner les secrets, ADMIN_*, APP_BASE_URL=https://votre-domaine
docker compose up -d --build
```

- Le port 3000 est lié à `127.0.0.1` : placez un reverse proxy TLS devant (Caddy : `votre-domaine { reverse_proxy 127.0.0.1:3000 }`).
- Volumes : `pgdata` (base), `storage` (captures, exports, sauvegardes).
- Mise à jour : `git pull && docker compose up -d --build` (le service `migrate` applique les migrations avant le démarrage).

Sans Docker : Node 22 + PostgreSQL + `npx playwright install --with-deps chromium`, puis deux services systemd
(`npm start` et `npm run worker`, ce dernier avec `KillSignal=SIGTERM` et `TimeoutStopSec=40`).

## o2switch (mutualisé)

Vérification des capacités : o2switch fournit Node.js via « Setup Node.js App » (Phusion Passenger) et PostgreSQL,
mais **pas de processus permanent** garanti (Passenger arrête les applications inactives) ni les dépendances système
de Chromium. Conséquences :

| Composant | Sur o2switch |
|---|---|
| Dashboard Next.js (`next start` / standalone) | Possible via Setup Node.js App |
| PostgreSQL | Possible (vérifier la disponibilité des extensions `pg_trgm` et `unaccent`) |
| Démos publiques `/preview/…` | Possible (servies par le dashboard) |
| **Worker** (recherches, envois, relances, captures) | **Non fiable** : à héberger sur un petit VPS ou une machine personnelle pointant vers la même base |

Architecture conseillée : dashboard + base sur o2switch, worker sur un VPS (ou le Mac de l'utilisateur) avec le même
`DATABASE_URL` (connexion distante autorisée par o2switch sur liste d'IP) et un `STORAGE_DIR` partagé ou un
stockage objet. Alternative la plus simple : tout sur le VPS.

## Supabase comme base

`DATABASE_URL` peut pointer vers Supabase (chaîne « Session pooler » ou connexion directe ; éviter le mode
*transaction pooler* qui ne supporte pas `LISTEN`/verrous de session — non utilisés ici, mais `SKIP LOCKED` nécessite
des transactions classiques, compatibles). Les migrations activent RLS sur toutes les tables sans politique : les
clés `anon`/`authenticated` de Supabase n'ont aucun accès ; seul le serveur (rôle propriétaire) lit et écrit.
Ne jamais exposer la clé `service_role` ni `DATABASE_URL` au navigateur (aucune variable `NEXT_PUBLIC_*` n'est utilisée).

## IA par abonnement (sans clé API)

Le worker appelle `claude` (Claude Pro/Max) ou `codex` (ChatGPT) avec **votre** connexion : il doit tourner sur une
machine où vous avez fait `claude auth login` / `codex login` (typiquement votre Mac). Sur un VPS : installez le CLI et
connectez-vous une fois en SSH. Avec Docker Compose : lancez plutôt le worker en natif (`npm run worker`), ou montez
le dossier de configuration (`~/.claude`, `~/.codex`) dans le conteneur du worker.

## Email

- `EMAIL_PROVIDER=sandbox` (défaut) : aucun envoi, messages enregistrés — signalé dans l'interface.
- `resend` : `RESEND_API_KEY` ; domaine vérifié (SPF/DKIM) ; webhook `https://votre-domaine/api/webhooks/resend` avec `RESEND_WEBHOOK_SECRET` (événements *sent, delivered, bounced, complained*).
- `smtp` : `SMTP_HOST/PORT/USER/PASSWORD/SECURE`.
- Réponses : IMAP (`IMAP_*`, synchronisation toutes les 5 min) et/ou webhook entrant `POST /api/webhooks/inbound`.
- Vérifiez SPF/DKIM/DMARC dans Paramètres → Prospection → Délivrabilité.

## Variables d'environnement

Voir `.env.example` (commentée). Minimum : `DATABASE_URL`, `APP_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
`SESSION_SECRET` (≥ 32 caractères), `APP_ENCRYPTION_KEY`.

## Ce qui n'est jamais fait sans action explicite

Aucun envoi réel tant que `EMAIL_PROVIDER` n'est pas `resend`/`smtp` **et** qu'une campagne n'est pas activée ;
aucune modification DNS ; aucun déploiement public automatique ; aucune dépense IA au-delà du budget journalier.
