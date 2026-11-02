# Workers et automatisations

`npm run worker` démarre un worker (applique d'abord les migrations). Plusieurs workers peuvent tourner en parallèle
(sur une ou plusieurs machines) : la réservation des tâches est atomique (`FOR UPDATE SKIP LOCKED`).

## Cycle d'une tâche

`PENDING → RUNNING → COMPLETED`, ou `RUNNING → RETRYING` (erreur temporaire : réseau, 429, 5xx ; backoff
exponentiel 30 s, 2 min, 8 min… avec gigue) `→ … → FAILED` après `max_attempts`. Les erreurs permanentes
(validation, configuration manquante) échouent immédiatement. `CANCELLED` par l'administrateur (les tâches longues
vérifient régulièrement si elles ont été annulées).

- **Persistance** : tout est en base (`automation_jobs`, `job_logs`) ; rien ne vit seulement en mémoire.
- **Idempotence** : `idempotency_key` unique (ex. `schedule:<id>:<créneau>`, `capture:<site>:v<n>`, `campaign.tick:<minute>`).
- **Reprise sur panne** : heartbeat toutes les 20 s ; une tâche `RUNNING` sans heartbeat depuis 5 min est remise en file (ou échouée si tentatives épuisées).
- **Envoi d'email** : un message resté `SENDING` (crash entre l'appel au fournisseur et l'écriture en base) n'est **jamais** renvoyé automatiquement : il passe en `FAILED` avec une note demandant de vérifier chez le fournisseur. Resend reçoit en plus une clé d'idempotence.

## Boucles internes du worker

| Fréquence | Action |
|---|---|
| 15 s | heartbeat du worker (`worker_heartbeats`) |
| 30 s | planifications dues (cron), récupération des tâches orphelines |
| 60 s | `campaign.tick` (préparation + envoi dans les plages, plafonds et intervalles), `inbox.sync` toutes les 5 min si IMAP, nettoyage quotidien à 03:17 |

## Types de tâches

`search.run`, `business.enrich`, `business.audit`, `website.generate`, `website.capture`, `proposal.generate`,
`campaign.tick`, `campaign.autofill`, `email.send`, `inbox.sync`, `import.run`, `maintenance.cleanup`, `backup.run`.

## Garde-fous

- **Pause globale** et **arrêt d'urgence des envois** (Automatisations) — pris en compte immédiatement.
- Planifications : intervalle minimal 15 min (protection contre les boucles).
- Concurrence : `WORKER_CONCURRENCY` et Paramètres → Automatisations.
- Dépenses : budget IA journalier vérifié **avant** chaque appel (estimation majorante) ; coût réel enregistré dans `api_usage`.
- Campagnes : plafond quotidien, plage horaire et fuseau, intervalle minimal entre deux envois, pause automatique après 3 échecs d'envoi consécutifs.

## Exemple : « chaque jour, rechercher les nouveaux coiffeurs dans un rayon de 30 km autour de Paris »

Recherche de prospects → Paris, 30 km, Coiffeur → icône Enregistrer → « Chaque jour (7 h) ». Chaque exécution
crée un `search_run` ; les nouveaux établissements sont enregistrés, enrichis, et le différentiel (apparus /
disparus) par rapport à l'exécution précédente est conservé.
