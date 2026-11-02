# Limitations réelles

Liste honnête de ce qui n'est pas fait, pas vérifié, ou limité par conception.

## Non vérifié dans l'environnement de développement (réseau restreint)

L'environnement de construction n'autorisait que quelques domaines sortants (dont le bucket S3 Overture). Le code
des intégrations suivantes est complet et couvert par des tests sur leurs parties pures (mapping, signatures,
règles), mais **n'a pas pu être exécuté contre le vrai service** :

- API Recherche d'entreprises (Sirene), Overpass (OSM), Google Places, géocodage api-adresse / Nominatim
  (la table de villes intégrée a servi de repli) ;
- fournisseurs IA (Anthropic, OpenAI, OpenRouter) — aucune clé disponible : la génération déterministe et l'assistant par règles ont été utilisés ;
- Google Places réel (la vérification de présence en direct est testée avec une réponse Places simulée, clairement identifiée comme donnée de test) ;
- envoi réel via Resend / SMTP, synchronisation IMAP, webhook Resend réel (la vérification de signature Svix est testée) ;
- vérification MX / SPF / DKIM / DMARC (pas de DNS sortant : statut « non testé », jamais « invalide ») ;
- crawl et audit de sites de prospects réels (vérifiés sur un serveur HTTP local) ;
- `docker compose up` (pas de démon Docker ; la configuration est validée par `docker compose config`).

À faire en premier sur votre machine : renseigner les clés, puis lancer une recherche avec Sirene activé, un email
de test (Paramètres → Prospection) et une génération IA.

## Fonctionnalités absentes ou partielles

- **Assistant** (§26 G) : 7 outils (recherche, liste, génération de démos, préparation de campagne en brouillon, performance des campagnes, conversations à traiter, pipeline). Il ne peut ni envoyer d'emails ni activer une campagne (volontaire). Sans IA, l'interprétation par règles couvre les formulations courantes en français uniquement. Le mode IA (tool use Anthropic / OpenAI) n'a pas été exécuté faute de clé.
- **Lighthouse** : non intégré (l'audit Playwright maison couvre HTTPS, mobile, SEO de base, CTA, liens cassés, erreurs JS).
- **Suivi des ouvertures d'email** : volontairement non activé (métrique imparfaite) ; seules les vues des démos sont comptées (hors robots et hors administrateur connecté).
- **Publication automatique vers un hébergement / domaine client** : non implémentée ; l'export ZIP statique est prêt à déposer sur n'importe quel hébergement.
- **Géocodage hors ligne complet** : la table intégrée ne couvre que ~140 villes ; un index des localités Overture (thème *divisions*) serait l'étape suivante.
- **Rayon > 50 km** pour Sirene/OSM : plafonné à 50 km par ces API.
- **Pièces jointes entrantes** : listées (nom, taille) mais non stockées.
- **Stockage** : disque local ; pas d'adaptateur S3/Supabase Storage fourni.
- **Mode AUTO des campagnes** : ajoute des prospects depuis une recherche enregistrée selon un score minimal ; il ne lance pas lui-même de nouvelles recherches (combiner avec une recherche planifiée).
- **Mode semi-automatique** : la validation des prospects se fait ligne par ligne dans la campagne.
- **Éditeur de sites** : formulaire + aperçu en direct (pas d'édition WYSIWYG directement dans la page).
- **Multi-langue des sites** : le champ langue existe, les bibliothèques de contenu sont en français.

## Par conception

- Un seul administrateur ; pas de comptes, d'équipes ni de facturation.
- La file de tâches PostgreSQL vise le volume d'un utilisateur (milliers de tâches/jour), pas des millions.
- Les recherches Overture lisent les données à distance à chaque exécution (rien n'est téléchargé en masse) ;
  la première recherche d'un worker charge les métadonnées (~5–10 s).
- Les prestations des sites générés sont génériques et marquées « indicatives » : elles doivent être validées avec le commerce.
