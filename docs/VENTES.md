# Le parcours simple

L’accueil affiche quatre actions : trouver un prospect, créer sa démo, préparer son email,
puis suivre la vente. La navigation garde cinq entrées ; les fonctions spécialisées restent
accessibles dans « Options avancées ».

## Démos et emails

Dans **Mes démos**, chaque site propose son aperçu, la copie du lien, **Préparer l’email** et
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
(`STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` pour les tests ;
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` pour les paiements réels), jamais dans le code ou le navigateur public.
Les champs vides conservent les clés déjà enregistrées. Les valeurs enregistrées sur le site sont prioritaires sur .env ; « Clés & connexions → Utiliser .env » rétablit une clé du fichier. L’état affiché décrit la configuration,
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
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

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
Dans **Paramètres → Paiement → Webhook de test en un clic** :

1. Installer une seule fois le CLI officiel sur le Mac :

   ```sh
   brew install stripe/stripe-cli/stripe
   ```

2. Coller la clé secrète de **test** `sk_test_…` dans le champ Stripe, ou conserver celle déjà enregistrée.
3. Cliquer sur **Générer et démarrer**. Le relais démarre et son secret `whsec_…` est enregistré
   automatiquement avec la clé de test, chiffré en base. Les champs restent masqués et vides : rien à copier.
   Il n’est pas nécessaire de lancer `stripe login` ni un second terminal.
4. Définir le prix, conserver une adresse locale pour ses essais, activer le paiement et enregistrer.
   Utiliser ensuite les moyens de paiement de test documentés par Stripe.
5. Cliquer sur **Arrêter** après les essais. Cela arrête le processus, sans supprimer les clés enregistrées.

Le bouton refuse les clés réelles et ne déclenche pas de paiement. Le relais utilise le port de
l’application et tourne sur **la machine qui héberge le serveur**, pas nécessairement celle du navigateur.
Laisser l’application ouverte. Fermer le serveur arrête le relais ; après un redémarrage, il faut le
relancer depuis le bouton. La recharge d’une page conserve son état. Cette fonction nécessite un serveur
Node persistant ; elle n’est pas adaptée aux hébergements serverless.

Pour un usage manuel, la commande du CLI reste disponible :

```sh
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Dans ce mode manuel seulement, copier le secret `whsec_…` affiché dans Paramètres → Paiement.
Ne pas lancer deux relais simultanément pour le même webhook. Le relais automatique enregistre
uniquement la paire de test ; les clés réelles et le webhook permanent restent conservés.
Les tests automatiques du dépôt simulent Checkout et envoient des événements signés ; ils ne
font pas de débit externe et ne valident pas votre compte Stripe réel.

### Vendre réellement

Il faut une application hébergée avec une URL publique HTTPS, un compte Stripe activé et
les clés/webhooks réels correspondants, puis le bouton **Désactiver le mode test et passer en production**
dans **Paramètres → L’essentiel**. Le mode réel refuse les adresses locales. Renseigner
un nom de domaine dans les paramètres ne publie pas l’application : voir DEPLOYMENT.md.
Après paiement, l’espace client propose le ZIP ou un abonnement au tarif mensuel configuré dans
Hébergement. La publication o2switch et le domaine existant sont automatisés après confirmation
Stripe et preuve de propriété DNS. Voir [HEBERGEMENT-ET-MODE-TEST.md](HEBERGEMENT-ET-MODE-TEST.md)
pour les réglages, le bouton de passage en production et les limites de validation. Les remboursements,
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

Le lanceur applique les migrations, dont `0005_studio.sql`. Le prix et les clés sont à configurer
une seule fois dans l’application avant d’activer les paiements.
