# Interface et parcours guidé

L’interface utilise un fond clair, des cartes blanches, un vert profond pour l’action
principale et des états explicites. Le thème sombre reste disponible. Les chiffres de
l’accueil proviennent de la base : prospects actifs, démos prêtes, démos avec une proposition
et ventes réelles confirmées. Aucun chiffre d’exemple n’est affiché.

Captures d’un espace de test vide : [ordinateur](screenshots/overview-desktop.png) et
[mobile](screenshots/overview-mobile.png).

## Retrouver son chemin

La navigation principale contient cinq entrées : Vue d’ensemble, Mes prospects, Mes démos,
Mes ventes et Paramètres. « Outils avancés » donne accès aux campagnes, à la réception, au
CRM, aux automatisations et aux statistiques. La recherche et la création sont aussi
accessibles directement depuis l’accueil et les étapes du parcours.

Le guide intégré est disponible à `/guide`. La barre « Prospect → Création → Proposition →
Vente » indique l’étape consultée, sans présenter les étapes précédentes comme terminées.
L’accueil propose la prochaine action selon les données et la configuration disponibles.

## Créer et partager

La recherche prépare un récapitulatif par entreprise : **ce qu’elle fait** et **ses avantages
repérés**, visibles dans les résultats. L’enrichissement automatique complète ces informations
en arrière-plan, y compris pour les entreprises déjà présentes lors d’une nouvelle recherche.
La liste s’actualise pendant le traitement. « Voir le récapitulatif » ouvre la fiche et les sources.

Dans la fiche, **Enrichir l’activité et les avantages** (ou Actions → Enrichir maintenant)
relit le site officiel : accueil, prestations et engagements, dans une limite de cinq pages.
Les indications OpenStreetMap et le brief public peuvent aussi documenter la fiche. Les notes
CRM privées sont exclues. Sans source détaillée, la fiche reste explicitement partielle ; aucun
avantage, prix ou jugement de qualité n’est inventé. Les avantages sont ceux annoncés dans les
sources, pas une évaluation indépendante.

La recherche et son enrichissement automatique préparent directement les passages collectés,
sans consommer d’appels IA. Avec le bouton d’enrichissement, si une IA est connectée et le budget
disponible, elle peut sélectionner des extraits courts dont la présence exacte dans la source
est contrôlée. Le récapitulatif reste disponible sans IA ou lorsque son quota est atteint.
Ses sources et particularités sont transmises
au générateur de sites. Aucune nouvelle clé n’est nécessaire. Pour d’anciens prospects, relancez
la recherche ou l’enrichissement pour créer leur récapitulatif.

1. Trouver une entreprise, ou importer une liste dans Mes prospects.
2. Vérifier sa fiche et choisir cette entreprise dans le générateur.
3. Cliquer sur « Créer le site sur mesure ». L’avancement s’affiche, puis l’éditeur s’ouvre
   lorsque la création est terminée.
4. Relire la démo et utiliser « Préparer l’email » : rédaction, relecture et ouverture de la
   messagerie restent des actions distinctes. Aucun envoi automatique n’est ajouté.

Les démos peuvent être recherchées, filtrées, copiées et placées dans la corbeille avec une
confirmation. Le prix et les justificatifs de vente restent gérés selon [VENTES.md](VENTES.md).

## Configurer sans chercher

Les liens suivants ouvrent directement le bon onglet :

- `/settings?tab=ai` : fournisseur et budget IA.
- `/settings?tab=outreach` : signature email.
- `/settings?tab=payment` : prix, connexion Stripe et activation du bouton de commande.
- `/settings?tab=connections` : toutes les clés de service, leurs mini tutos et les connexions SMTP / IMAP.

Les modèles IA, les réglages de campagnes et les diagnostics restent accessibles dans des
sections repliables. Les contrôles de configuration ne remplacent pas un essai réel de votre
compte IA ou Stripe.

## Clavier et mobile

`⌘ K` sur Mac ou `Ctrl K` place le curseur dans la recherche de prospects. Un lien d’évitement
donne accès au contenu principal. Le menu mobile se ferme avec Échap et conserve le focus
dans le panneau tant qu’il est ouvert. Les formulaires ont des libellés, les actions ont un
état désactivé ou de chargement et les listes larges défilent dans leur propre conteneur.
La préférence de mouvement réduit désactive les transitions décoratives.

Les tests navigateur couvrent les pages principales et avancées à 360, 390 et 768 px, les thèmes clair et
sombre, le menu, les liens directs, l’avancement de création, les emails et le parcours de
vente. L’avancement de génération y utilise une réponse de test locale ; aucun appel IA
externe ni paiement réel n’est déclenché par ces tests d’interface.
