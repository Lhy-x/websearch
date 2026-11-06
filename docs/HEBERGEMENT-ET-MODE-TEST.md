# Générer, vendre et publier sur o2switch

## Mise à jour sur Mac, sans Docker

Arrêtez le lanceur avec Ctrl+C dans son terminal, puis :

```sh
cd ~/Documents/websearch
git pull --ff-only origin claude/elegant-einstein-2aqprx
PATH="$(brew --prefix node@22)/bin:$PATH" npm ci
bash LANCER-MAC.command
```

Le lanceur applique les migrations, dont `0005_studio.sql`, et démarre le site et le worker.
Il conserve vos données et vos clés existantes. Ne lancez pas de remise à zéro pour une mise à jour.

## Créer plusieurs sites sans perdre le suivi

Sélectionnez vos entreprises dans **Mes prospects**, puis **Créer les sites sur mesure**.
Le lot s’affiche dans le générateur avec une ligne par entreprise, son attente, l’étape en cours,
l’échec éventuel et son lien une fois le site prêt. Le lien du lot fonctionne après rechargement.
Les lots sont paginés par 40, jusqu’à 2 000 prospects ; aucune coupure silencieuse à 200.
Deux sélections qui se chevauchent réutilisent les créations déjà actives. Vous pouvez reprendre
les échecs ou annuler les tâches encore en attente. Une création déjà en cours finit son travail.
La concurrence du moteur se règle dans les connexions ; une file d’attente n’est pas un échec.

Le bouton normal utilise l’IA et le skill 3D importé. Les anciennes demandes « ai » et « auto » utilisent aussi ce pipeline ; un refus ne revient plus à un template. Le moteur récupère le texte du site officiel
connu si nécessaire, les horaires, contacts, prestations et enrichissements validés. Dans la fiche
prospect, **Brief de création**, ajoutez des informations publiques exactes et une direction artistique
facultative. Les notes CRM privées ne sont pas utilisées. Sans IA configurée, le bouton explique
la connexion nécessaire ; il ne remplace pas une création personnalisée par un template.
Avant le HTML, l’IA propose trois pistes de conception pour le dossier et en sélectionne une.
Elle doit justifier ses décisions par des citations exactes d’au moins trois faits distincts
(deux seulement si le dossier ne contient que deux champs), et utiliser le brief ou le texte officiel
lorsqu’ils existent. Le modèle ne reçoit plus de liste de prestations génériques issue du catalogue.
La direction retenue est réservée en base : deux créations simultanées voient aussi les identités
réservées par leurs voisines. Les vingt créations récentes ou en cours servent de contre-exemples,
y compris une précédente création pour la même entreprise.

Le contrôle compare le DOM simplifié, les styles de mise en page et la géométrie réellement rendue
dans Chromium. Une copie ne passe pas simplement en changeant de couleurs, de classes ou de conteneurs.
Une reconception peut être demandée même avec zéro passe de correction ordinaire. Les tentatives sont
bornées : une copie persistante reste en échec visible et ne devient pas un template de secours.
Les polices prévues doivent être appliquées, et les détails publics cités dans le plan doivent nourrir
la rédaction. Dans l’éditeur, ouvrez **La direction artistique du site** pour consulter ces faits et
les raisons du choix. La qualité artistique finale dépend toujours du modèle ; relisez les créations.

Le rendu 3D dispose aussi d’une présentation individuelle : trois à sept fragments, épaisseur,
rotation, dispersion, sens du mouvement, rugosité, exposition, fond transparent et accent facultatif.
La sphère décorative et les quatre fragments ne sont plus imposés aux nouvelles créations.
La conception préalable et les reconceptions consomment des appels IA supplémentaires, toujours soumis
au budget et au plafond journalier. Régénérez un site pour obtenir ce nouveau processus.

## Essayer le parcours en local

L’application démarre en **mode test**. Le bandeau et **Paramètres → L’essentiel → Du test à la production**
indiquent le mode. Les emails envoyés par l’application restent en Sandbox pendant les essais.
Les recherches de données et l’IA peuvent toujours consommer les quotas de leurs fournisseurs.

1. Dans **Paiement**, renseignez le prix unique du site et activez le paiement.
2. Sélectionnez **Clés de test**. Enregistrez une clé Stripe `sk_test_…` et son webhook,
   ou utilisez **Générer et démarrer** après `brew install stripe/stripe-cli/stripe`.
3. Dans **Hébergement**, choisissez **votre** prix mensuel et cochez l’offre. Aucun tarif n’est imposé.
4. Ouvrez une démo, commandez le site avec un moyen de paiement de test Stripe, puis attendez
   la confirmation du webhook. Le client accède alors à son espace privé.
5. Testez le téléchargement, l’abonnement, la publication simulée et la saisie du domaine.
   Aucun fichier n’est transféré et aucun domaine n’est ajouté chez o2switch pour une commande de test.

Les clés de test (`STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`) sont séparées des clés
réelles (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). Le relais local modifie seulement les clés de test.
Une ancienne paire `sk_test_…` dans les variables historiques reste utilisable jusqu’à son remplacement.
Une commande de test reste un essai même après activation de la production. Un contrat réel existant
continue d’être géré si l’administrateur revient en mode test pour ses nouvelles commandes.

## Configurer o2switch une seule fois

Dans **Paramètres → Hébergement**, ouvrez **Connexion o2switch** :

1. Dans cPanel, repérez le nom du serveur (`…o2switch.net`), le compte principal et l’IPv4 partagée.
2. Préparez une adresse publique HTTPS qui correspond au dossier de publication, par exemple
   `https://clients.mon-agence.fr` et `/public_html/clients`. Le domaine doit déjà appartenir au compte.
   Le nom du dossier dépend de la configuration réelle de votre cPanel.
3. Renseignez le mot de passe du compte FTP avec accès à ce dossier. La connexion utilise **FTPS
   explicite sur le port 21**, certificat TLS vérifié, avec les ports passifs accessibles.
4. Dans cPanel → **Jetons API**, créez un jeton pour la gestion des domaines et renseignez-le dans le site.
   Le compte doit autoriser les API cPanel, les domaines supplémentaires et AutoSSL.
5. Enregistrez, puis cliquez **Tester cPanel et FTPS**. Le test lit les domaines et liste le dossier ;
   il ne publie rien. La vérification de production est valable 24 h et liée aux réglages enregistrés.

Les secrets sont chiffrés en base et peuvent aussi venir de `.env` : `O2SWITCH_FTP_PASSWORD`,
`O2SWITCH_CPANEL_TOKEN`. Ils ne sont jamais exposés dans l’espace client.

Les fichiers sont déposés dans `dossier/pf-sites/UUID-commande/`. Les ressources sont transférées
avant activation de l’index. Le site principal et les autres commandes ne sont pas remplacés.
Les sites livrés sont statiques : pas de serveur de formulaire, de boîte mail ou de CMS ajouté.

## Passer réellement en production

Hébergez d’abord **ProspectForge et son worker Node/PostgreSQL** sur une machine disponible avec une
URL HTTPS publique. L’hébergement des fichiers clients sur o2switch ne déploie pas automatiquement
le tableau de bord. Les webhooks ne peuvent pas arriver sur un Mac éteint ou une URL localhost.

1. Dans **Clés & connexions**, définissez l’URL publique de l’application. Dans **Paiement**, celle des démos.
2. Dans **Paiement → Clés réelles**, enregistrez `sk_live_…` et le secret du webhook HTTPS permanent.
   Ne réutilisez pas le secret temporaire du relais local. Ajoutez tous les événements listés dans VENTES.md.
3. Configurez l’identité fiscale et le **portail client Stripe**, avec gestion du paiement et résiliation.
   Les factures récurrentes sont celles de Stripe Billing. Le tarif d’un abonnement est figé à la souscription ;
   modifier le prix de l’offre concerne les nouveaux abonnements, pas les contrats existants.
4. Configurez le service email souhaité ou conservez explicitement Sandbox.
5. Si l’offre d’hébergement est activée, renseignez le prix et réussissez le test o2switch.
6. Ouvrez **L’essentiel → Du test à la production**, corrigez les éléments indiqués, puis cliquez
   **Désactiver le mode test et passer en production**. Stripe valide aussi la clé réelle en lecture seule.

Le bouton devient disponible lorsque les réglages sont prêts ; changer un champ générique ne suffit
pas à contourner ces vérifications. **Revenir au mode test** reste possible.

## Ce que voit le client après paiement

Son lien privé `/purchase/…` permet de télécharger la version achetée, retrouver la facture initiale,
choisir l’abonnement mensuel et ouvrir le portail Stripe pour ses factures récurrentes et sa résiliation.
Le téléchargement reste acquis sans abonnement. Le lien de gestion est confidentiel : partagez l’URL
publiée avec les visiteurs. Le vendeur le retrouve dans **Mes ventes → Ouvrir l’espace client**.

La première publication démarre après confirmation Stripe de l’abonnement et de sa facture payée.
Un retour du navigateur depuis Checkout ne suffit pas. Un bouton permet de demander une publication
ou de la reprendre après un échec. Le worker contrôle périodiquement les abonnements ; un contrat
non à jour suspend le site publié, tout en conservant les fichiers téléchargeables. Une résiliation
programmée à la fin de période conserve l’accès jusqu’au terme payé. Le prix, la devise et le contrat
sont vérifiés côté serveur, jamais pris dans le navigateur client.

Pour un **domaine que le client possède déjà**, l’espace affiche :

- un TXT `_prospectforge.domaine` avec sa preuve de propriété ;
- un A sur le domaine choisi vers l’IPv4 o2switch.

Le client ajoute ces valeurs chez son registrar. Sur Cloudflare, commencez en mode DNS seulement.
Après validation des deux enregistrements, le worker relie le domaine au dossier de cette commande.
Il attend ensuite un certificat HTTPS valide avant d’afficher le domaine comme actif. La propagation
DNS et AutoSSL peuvent prendre du temps ; une vérification reprend toutes les 5 min pendant 48 h,
ou manuellement avec **Vérifier les DNS et HTTPS**. Le client peut continuer d’utiliser l’adresse
initiale pendant cette attente. Un domaine déjà associé à un autre dossier n’est pas déplacé.
Changer un domaine déjà relié nécessite l’intervention du vendeur dans cPanel.
L’achat et le renouvellement du nom de domaine restent chez le registrar.

## Objectifs et niveaux

Le niveau de l’atelier est visible dans le menu. Cliquez pour consulter les étapes, leur progression
et leurs liens : premier prospect, IA connectée, site prêt, email préparé, essai Stripe, vraie vente,
site réel en ligne. Les XP viennent d’actions abouties et ne sont attribués qu’une fois. Trois sites
pour une même entreprise ne valident pas l’objectif « trois entreprises ». Les ventes de test ne
valident pas une vente réelle. Une remise à zéro de l’espace réinitialise aussi ces objectifs.

## Vérification avant les premiers clients

Les tests du dépôt simulent Stripe, cPanel et FTPS. Ils vérifient les contrats de requête, les contrôles
de paiement, la simulation et les parcours navigateur ; ils ne valident pas les permissions de votre
compte o2switch ni vos paiements réels. Après configuration, validez une publication sur votre compte,
le DNS et le certificat, puis un paiement et sa facture avant de promettre la livraison automatique.
