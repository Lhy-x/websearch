# Sauvegarde et restauration

## Sauvegarde

- Automatisations → « Sauvegarder maintenant », ou planification `backup.run` (ex. `30 2 * * *`).
- Produit `STORAGE_DIR/backups/prospectforge-<date>.sql.gz` via `pg_dump --no-owner --no-privileges` (14 dernières conservées).
- La dernière sauvegarde est affichée dans Paramètres → Infrastructure.
- Sauvegardez aussi `STORAGE_DIR` (captures, exports) et votre `.env` (sans lui, les secrets chiffrés en base sont illisibles : conservez `APP_ENCRYPTION_KEY`).

Manuellement :

```bash
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > prospectforge.sql.gz
```

## Restauration

```bash
createdb -O pf prospectforge_restore
gunzip -c prospectforge-XXXX.sql.gz | psql postgres://pf:pf@localhost:5432/prospectforge_restore
```

Puis pointez `DATABASE_URL` vers la base restaurée et relancez dashboard et worker. Les tâches `RUNNING` au moment
de la sauvegarde seront reprises automatiquement (heartbeat expiré).

## Rétention

`maintenance.cleanup` (quotidien) : journaux de tâches > 30 jours, tâches terminées > 30 jours, démos expirées
désactivées, tentatives de connexion > 7 jours. Suppression d'un prospect (RGPD) : fiche → Actions → « Supprimer les
données » ; l'opposition éventuelle reste dans la liste de suppression pour garantir l'absence de recontact.
