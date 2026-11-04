# Configurer les services depuis le site

Ouvrir **Paramètres → Clés & connexions**. Les catégories IA, Recherche, Email et Paiement
contiennent chaque clé, son état et un **mini tuto** avec un lien officiel. Les clés ne sont
jamais renvoyées par l’API ou préremplies : seuls les états sont affichés. Elles sont chiffrées
en base avec la clé de chiffrement locale.

## Démarrer avec le minimum

1. **Mon IA** : choisir Claude / Codex par abonnement si le CLI officiel est installé et connecté
   sur la machine du moteur. Exécuter une fois `claude auth login` ou `codex login`. Une clé API
   n’est pas nécessaire pour ce mode.
2. Avec une API : créer une clé chez Anthropic, OpenAI ou OpenRouter, la coller dans la carte
   correspondante, puis choisir ce fournisseur et les modèles dans **Mon IA**. La facturation
   API est distincte des abonnements Claude / ChatGPT. Le test de connexion IA peut consommer
   un petit appel ; il est lancé explicitement par le bouton de test.
3. Pour rechercher des entreprises, commencer avec Overture ou Recherche d’entreprises :
   ces sources publiques ne demandent pas de clé. Google Places reste facultatif. La clé
   INSEE est conservée pour des intégrations Sirene distinctes ; elle n’est pas utilisée par
   le connecteur public Recherche d’entreprises.
4. Les brouillons d’email peuvent être préparés sans service d’envoi. Pour les campagnes,
   configurer Resend ou SMTP, puis l’expéditeur et la signature dans **Mes emails**.
5. Pour vendre : définir un prix et configurer Stripe dans **Paiement**. Commencer en test.
   **Générer et démarrer** lance le relais local et enregistre son secret automatiquement ;
   installer le CLI Stripe une fois sur le Mac est le seul prérequis supplémentaire.
   Le détail des webhooks, factures et téléchargements est dans [VENTES.md](VENTES.md).

## Les clés disponibles

| Service | Valeurs | Où les obtenir |
| --- | --- | --- |
| Anthropic | `ANTHROPIC_API_KEY` | Console Anthropic → clés API |
| OpenAI | `OPENAI_API_KEY` | Plateforme OpenAI → API keys |
| OpenRouter | `OPENROUTER_API_KEY` | OpenRouter → Settings → Keys |
| Google Places | `GOOGLE_PLACES_API_KEY` | Google Cloud → Places API (New) → Identifiants |
| INSEE (intégrations distinctes) | `INSEE_SIRENE_API_KEY` | Portail API INSEE |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Tableau de bord Stripe → clés API et webhooks |
| Resend | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Resend → API keys et webhooks |
| SMTP / IMAP | `SMTP_PASSWORD`, `IMAP_PASSWORD` | Paramètres de votre hébergeur ; mot de passe d’application si requis |
| Adaptateur de réception | `INBOUND_WEBHOOK_SECRET` | Générer un secret dans sa carte et le reporter dans votre adaptateur |

La vérification d’un domaine, les limites et la facturation se règlent chez le fournisseur.
Une clé « enregistrée » signifie qu’elle est sauvegardée, pas que le compte externe a été validé.
Aucun email réel ni paiement réel n’est lancé par le simple enregistrement d’une clé.
La configuration IMAP active la relève périodique des réponses quand le moteur tourne.

## Connexions et valeurs prioritaires

Les cartes **Email** permettent de régler le fournisseur d’envoi, les serveurs, ports,
identifiants et TLS SMTP / IMAP. **Recherche** contient l’adresse Overpass, la version Overture
et le contact du robot. **Réglages** contient l’adresse publique, le nombre de traitements
parallèles et, si nécessaire, les chemins des outils Claude / Codex.

Ces valeurs sont utilisées par le site et le moteur sans redémarrage. Les nouveaux réglages
s’appliquent aux prochains traitements ; une connexion déjà en cours n’est pas interrompue.
Les valeurs sauvegardées sur le site passent avant `.env`. **Désactiver** une clé crée une
désactivation explicite, même si `.env` en contient une. **Utiliser .env** retire cette
surcharge. Une saisie vide dans le formulaire ne supprime pas une clé par accident.

L’adresse publique doit correspondre à une application réellement hébergée. Renseigner
un domaine ne publie pas le site. Pour tester Stripe sur localhost, suivre [VENTES.md](VENTES.md).

## Paramètres de démarrage

`DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`
et `STORAGE_DIR` restent sur la machine. La base doit être joignable avant d’ouvrir l’interface ;
les clés de session et de chiffrement protègent l’accès et les secrets déjà sauvegardés.
L’installateur Mac les initialise. Elles ne sont pas exposées dans les formulaires du site.
Les paramètres internes du serveur Node, du proxy réseau et du navigateur de capture restent
également des paramètres de déploiement.
