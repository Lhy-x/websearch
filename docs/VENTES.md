# Le parcours simple

L’accueil affiche quatre actions : trouver un prospect, créer sa démo, préparer son email,
puis suivre la vente. La navigation garde cinq entrées ; les fonctions spécialisées restent
accessibles dans « Options avancées ».

## Démos et emails

Dans **Démos**, chaque site propose son aperçu, la copie du lien, **Préparer l’email** et
**Supprimer**. L’email est un brouillon modifiable, avec destinataire, objet et texte.
Le bouton de rédaction utilise le worker. Si Stripe est activé et configuré, le prix unique
et un lien de commande sont ajoutés côté serveur à chaque variante : le modèle ne choisit
pas le montant. « Copier » ou « Ouvrir ma messagerie » permettent de l’envoyer manuellement.
Aucun email n’est envoyé automatiquement par ces actions. Les campagnes existantes restent
une fonction avancée explicite.

## Prix unique et Stripe

Dans **Paramètres → Paiement**, définir :

1. Le prix total identique pour tous les sites (en EUR par défaut).
2. L’adresse publique des démos.
3. La clé secrète Stripe et le secret de signature du webhook.
4. L’activation du bouton de paiement.

Commencer avec une clé `sk_test_…`. Les secrets sont saisis dans l’application ou dans `.env`
(`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), jamais dans le code ou le navigateur public.
Les champs vides conservent les clés déjà enregistrées. L’état affiché décrit la configuration,
pas une garantie d’acceptation du compte Stripe.

Le bouton de démo ouvre une page de commande puis **Stripe Checkout**. Le montant vient du
serveur. Une commande fige le prix et la version du site ; les clics concurrents réutilisent
la même session via une clé d’idempotence. Stripe collecte les coordonnées de facturation
et crée une facture après paiement (`invoice_creation.enabled`). Configurez votre identité,
votre adresse professionnelle, la TVA et la numérotation dans votre compte Stripe :
l’application n’invente pas de taux de TVA. Si un taux s’applique, créez-le dans Stripe puis renseignez son ID `txr_…` dans l’option TVA : le prix total saisi inclut ce taux. Sans ID, aucun taux n’est ajouté. Le calcul fiscal automatique selon le pays et la situation du client n’est pas inclus.

### Webhook à configurer

Endpoint : `https://votre-domaine/api/webhooks/stripe`.
Événements :

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `invoice.paid`
- `invoice.finalized`

Le retour depuis Stripe n’est jamais une preuve de paiement. Seul le webhook signé confirme
le montant, la devise et le mode test/réel. Les événements sont idempotents et peuvent arriver
dans le désordre. Une session terminée mais encore impayée reste en attente. Les URL de facture
hébergée et PDF sont conservées après réception des événements Stripe.

Le client retrouve sa facture et le ZIP de la version achetée depuis son lien privé de
confirmation. Le téléchargement est bloqué tant que le paiement n’est pas confirmé.
Une vente réelle alimente le CRM une seule fois. Les commandes de test sont clairement
marquées et exclues du chiffre d’affaires réel.

### Tester sur son Mac

Un site `localhost` n’est pas accessible à un prospect ou au webhook Stripe distant.
En test, installer et connecter le CLI officiel Stripe selon https://docs.stripe.com/stripe-cli,
puis lancer dans un autre terminal :

```sh
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copier le secret `whsec_…` affiché par ce listener dans Paramètres → Paiement. Utiliser ensuite
les moyens de paiement de test documentés par Stripe. Garder le listener et l’application ouverts.
Les tests automatiques du dépôt simulent Checkout et envoient des événements signés ; ils ne
font pas de débit externe et ne valident pas votre compte Stripe réel.

### Vendre réellement

Il faut une application hébergée avec une URL publique HTTPS, un compte Stripe activé et
les clés/webhooks réels correspondants. Le mode réel refuse les adresses locales. Renseigner
un nom de domaine dans les paramètres ne publie pas l’application : voir DEPLOYMENT.md.
L’hébergement client n’est pas automatique ; le client télécharge le site livré. Les remboursements,
les avoirs et les contestations se gèrent dans Stripe ; leur synchronisation n’est pas incluse ici.

## Supprimer un site

**Supprimer** place le site dans la corbeille et rend immédiatement sa démo indisponible.
**Corbeille → Restaurer** annule l’action. Les sessions Checkout ouvertes doivent être expirées
avant suppression ; un paiement en attente bloque temporairement la suppression.
Les commandes, factures et versions déjà achetées restent conservées et téléchargeables :
supprimer une démo ne doit pas effacer les justificatifs d’une vente.
La corbeille conserve les fichiers pour restauration ; ce n’est pas une purge définitive.

## Mise à jour locale

```sh
cd ~/Documents/websearch
git pull --ff-only origin claude/elegant-einstein-2aqprx
PATH="$(brew --prefix node@22)/bin:$PATH" npm ci
bash LANCER-MAC.command
```

Le lanceur applique la migration `0004_sales.sql`. Le prix et les clés sont à configurer
une seule fois dans l’application avant d’activer les paiements.
