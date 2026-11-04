# Repartir avec une base vide, en gardant l’administrateur

Cette opération vise **la base indiquée dans le fichier .env de la machine où la commande est
exécutée**. Un `git pull` ne supprime aucune donnée. La base du Mac et celle d’un environnement
cloud sont distinctes.

## Sur Mac

1. Arrêter l’application et son moteur avec **Ctrl+C** dans le Terminal de lancement. Fermer
   aussi toute autre application utilisant cette même base.
2. Depuis le dossier du projet, lancer :

   ```bash
   bash REINITIALISER-MAC.command
   ```

3. Vérifier l’hôte, le nom de la base et les compteurs affichés. Taper `REINITIALISER` pour
   exécuter l’effacement après sauvegarde.
4. Relancer `bash LANCER-MAC.command` et se reconnecter avec les mêmes identifiants admin.

Pour examiner la cible sans rien modifier : `npm run reset:local`. Pour un lancement explicite
sans la question du fichier `.command` : `npm run reset:local -- --confirm`.
L’installateur fournit Node 22, PostgreSQL et `pg_dump` ; le fichier Mac prépare leur PATH.

## Effet exact

Les prospects, sites, versions, propositions, campagnes, emails, conversations, tâches,
ventes, factures enregistrées localement, événements, caches, historiques, réglages et clés
stockées dans la base du projet sont effacés. Le registre de migrations reste intact et les
références système nécessaires à l’application sont réinstallées. Aucun prospect ou site
d’exemple n’est ajouté.

Le compte admin est défini dans `.env`, pas dans une table utilisateur. Son email, son hash de
mot de passe, la clé de session et la clé de chiffrement restent inchangés. Les valeurs de `.env` restent sur la machine. L’envoi repart en simulation, la relève IMAP
est désactivée et les clés de service sont désactivées, même si `.env` en contient : cela évite
de réimporter immédiatement d’anciennes réponses. Réactivez vos services dans « Clés & connexions » ;
« Utiliser .env » permet de reprendre une clé existante. Les anciennes surcharges sont effacées. Les anciennes sélections et l’historique local de l’assistant sont retirés à
la réouverture du nouvel espace.

Les données et paiements détenus par Stripe ne sont pas supprimés. Les fichiers sur disque,
notamment les sauvegardes et les anciens médias, sont conservés. La commande ne touche pas
aux tables d’autres applications et n’utilise pas de `TRUNCATE CASCADE`.

## Sauvegarde avant effacement

Une copie SQL compressée et un manifeste des compteurs sont créés dans
`storage/reset-backups` (ou le `STORAGE_DIR` configuré). Ces copies ne sont pas soumises à la
purge des sauvegardes quotidiennes. Les permissions du fichier SQL sont limitées au propriétaire.
La sauvegarde contient des données privées : ne pas la committer sur GitHub.

Si `pg_dump` échoue, si une autre connexion utilise la base, ou si la transaction échoue,
la commande refuse l’effacement. L’accès admin doit être initialisé avant toute exécution.
Pour restaurer les données, conserver le fichier `.env` et faire restaurer le SQL dans une
base PostgreSQL compatible ; les anciennes clés chiffrées nécessitent la même `APP_ENCRYPTION_KEY`.
