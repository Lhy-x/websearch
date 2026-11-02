# Diagnostic

| Symptôme | Cause probable | Action |
|---|---|---|
| Recherche bloquée sur « En attente du worker » | Aucun worker actif | `npm run worker` ; vérifier Automatisations → Workers |
| « Localisation introuvable » | Géocodeurs en ligne injoignables et ville absente de la table intégrée | Saisir latitude/longitude (section avancée) |
| Source « erreur : fetch failed » | Réseau sortant bloqué vers cette API | Vérifier pare-feu/proxy ; les autres sources continuent |
| Overture lent au premier lancement | Lecture des pieds parquet (16 fichiers) | Normal (~5–10 s) ; mis en cache tant que le worker tourne |
| Génération « IA non configurée » | Pas de fournisseur ou de clé | Paramètres → IA + Clés API, ou moteur « Déterministe » |
| « Budget IA journalier atteint » | Garde-fou de dépenses | Augmenter le budget ou attendre le lendemain |
| Emails « Programmé » qui ne partent pas | Campagne hors plage, plafond atteint, arrêt d'urgence, pause, worker arrêté | Bouton « Traiter maintenant » de la campagne : la raison est affichée |
| Emails non envoyés réellement | `EMAIL_PROVIDER=sandbox` | Configurer Resend/SMTP (bandeau affiché dans la campagne) |
| Message en `FAILED` « état incertain » | Worker interrompu pendant un envoi | Vérifier chez le fournisseur avant de renvoyer |
| Réponses absentes de l'Inbox | IMAP/webhook non configurés | Configurer IMAP ou le webhook ; à défaut « Saisir un email reçu » |
| MX « non testé » partout | DNS indisponible depuis le serveur | Normal dans certains conteneurs ; le statut reste « non vérifié » (jamais « invalide » par défaut) |
| Captures absentes | Chromium non installé pour le worker | `npx playwright install chromium` (ou image Docker du worker) |
| 401 sur toutes les API | Session expirée (7 jours) ou `SESSION_SECRET` changé | Se reconnecter |
| « Trop de tentatives » à la connexion | 5 échecs en 15 min depuis la même IP | Patienter 15 min |

Journaux utiles : Automatisations (journal de chaque tâche), fiche prospect → Historique, `audit_logs` en base,
sortie standard du worker.
