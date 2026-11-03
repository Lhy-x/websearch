# Sites 3D Glass

Dans **Générateur de sites → Moteur**, choisir **3D Glass — verre interactif (sans IA)**,
ou choisir ce moteur depuis la fiche d’un prospect. Le worker crée une version éditable
à partir des faits du prospect et du template métier. Aucune clé IA ni service 3D externe
n’est nécessaire. Ce mode reste un choix explicite ; il ne remplace pas le mode automatique.

L’éditeur propose **Expérience** (classique / 3D) et **Objet 3D** (12 silhouettes).
Les couleurs **Principale** et **Accent** alimentent le dégradé de la scène.
Le moteur fourni utilise Space Grotesk. Il présente quatre chapitres cinématiques,
puis les coordonnées. Les premières prestations sont montrées dans la scène ;
**Toutes les informations** conserve l’ensemble des sections, médias et textes éditables.
Les prestations indicatives restent identifiées comme telles. Aucun chiffre de résultats
commercial ni coordonnée n’est inventé.

Le verre, la lumière et les fragments sont rendus par Three.js/WebGL en temps réel.
La silhouette réagit au curseur et se décompose/recompose au défilement. Si JavaScript,
WebGL ou les animations ne sont pas disponibles, la version lisible reste ouverte.
Le réglage système « réduire les animations » désactive la scène, y compris lorsqu’il
change pendant la visite. Les liens de contact utilisent tel:/mailto: ; il n’y a pas de
formulaire d’envoi côté serveur.

L’export ZIP contient un `index.html` autonome avec modules, polices et silhouette
intégrés, `site.json`, les licences des dépendances et la provenance du moteur.
Il peut être hébergé sur un hébergement statique. Les médias ajoutés restent des liens
distants. Le mode actuel propose des formes prédéfinies ; il n’importe pas encore les
logos clients ni les modèles GLTF/GLB.

## Isolation

Les données restent dans la configuration structurée validée par Zod. Le renderer
n’exécute aucun code produit par un modèle ou saisi dans l’éditeur. Le moteur et les
modules locaux proviennent de `vendor/premium-3d-glass` (ZIP fourni par l’utilisateur).
Les scripts inline sont autorisés par empreinte SHA-256, sans autorisation générale
`unsafe-inline` pour les scripts. L’aperçu public applique aussi une sandbox sans
`allow-same-origin` ; l’iframe de l’éditeur autorise les scripts, sans accès à l’origine
du dashboard. Les sites HTML sur mesure conservent leur nettoyage sans JavaScript.

## Vérification

- `npm test` : inclut la génération 3D, le versionnement, l’échappement des faits,
  les ressources intégrées, la CSP et l’export.
- `npm run test:e2e -- 3d-glass` : utilise les bases isolées et le vrai worker ; vérifie
  WebGL, les fragments, la navigation, l’éditeur, l’export et le mouvement réduit.
  Le test active SwiftShader pour les machines CI sans GPU.
- `npm run typecheck` et `npm run build` (ajouter `-- --webpack` si Turbopack ne peut
  pas créer ses sockets dans l’environnement cloud).

Les ressources sont explicitement incluses dans la sortie Next.js standalone.
Conserver `PROVENANCE.md`, `SOURCES.md` et les licences jointes dans les livraisons.
