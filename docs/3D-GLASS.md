# Atelier : un site personnalisé en un clic

Le parcours principal ne demande plus de template, de style ou de forme prédéfinie.
Choisissez un prospect dans **Générateur de sites**, puis cliquez sur **Créer le site sur mesure**.
Le même bouton existe dans la fiche prospect et dans les actions groupées.

## Une connexion IA, une seule fois

Dans **Paramètres → IA**, connectez votre fournisseur : Claude Code avec votre abonnement,
Codex avec votre abonnement, ou un fournisseur API pris en charge. Les CLIs doivent être
installés et connectés sur le Mac qui exécute le worker. Exemple pour Claude Code :

```sh
npm install -g @anthropic-ai/claude-code
claude auth login
```

Choisissez ensuite **Claude — abonnement** dans l’application et testez la connexion.
Pour Codex, utilisez `npm install -g @openai/codex`, puis `codex login` et choisissez Codex.
Conservez la limite d’appels ou le budget configuré. La génération peut prendre plusieurs
minutes selon le modèle, les contrôles et les passes de correction.

L’atelier affiche clairement une IA manquante et ne substitue pas un template déterministe.
Les anciens moteurs restent lisibles et accessibles par API pour les sites déjà créés.

## Ce qui est conçu pour chaque entreprise

- Une direction artistique et un plan de composition rédigés par le modèle.
- Le HTML/CSS complet, sans grille de sections imposée et sans injection de layout prédéfini.
- Les textes fondés sur les informations vérifiées du prospect.
- Une silhouette SVG originale inspirée du métier, extrudée en verre en temps réel.
- La palette, la position et les dimensions de la scène intégrées à la composition.

Le modèle reçoit le skill **Premium 3D Glass** fourni dans le ZIP, ses recommandations de
silhouette et le guide frontend-design déjà présent. Le dossier remplace l’interview du skill.
Ses suggestions de statistiques placeholders sont expressément écartées : aucun résultat,
témoignage ou contact n’est inventé. La sculpture n’est pas présentée comme un logo officiel.

Le rendu réutilise les fonctions géométriques et le matériau de verre avec dispersion du
moteur fourni. Il ne réutilise pas sa page cinématique en cinq chapitres. L’IA écrit la page
et réserve un emplacement `data-glass-scene` ; le moteur validé y ajoute la 3D.

## Contrôles, modifications et livraison

Le HTML du modèle est nettoyé, les faits sont vérifiés, la mise en page est mesurée sur
ordinateur/mobile et la scène doit produire quatre fragments WebGL valides dans Chromium.
Les problèmes sont renvoyés au modèle pendant les passes de correction configurées.
Si la relecture visuelle est activée, le modèle reçoit des captures avec la scène 3D.
Les erreurs critiques restantes bloquent la livraison.

L’éditeur sur mesure permet de demander des modifications par instruction. La direction 3D
est conservée dans les versions et les corrections. L’aperçu public demeure expirable et
révocable. Le ZIP exporte un HTML autonome pour le moteur, la configuration et les licences.
Les polices Google et les médias autorisés ajoutés par l’utilisateur peuvent rester distants.
Les liens tel:/mailto: sont utilisés plutôt qu’un faux formulaire d’envoi.

Sans JavaScript, sans WebGL ou avec la réduction des animations, le contenu de la page et
l’illustration SVG restent visibles. Le changement de préférence pendant la visite arrête
la scène. Aucun code fourni par le modèle n’est exécuté : seuls les modules locaux et le
runtime relu sont autorisés par empreinte SHA-256. L’aperçu est isolé sans `allow-same-origin`.
Les SVG sont reconstruits à partir d’un petit sous-ensemble géométrique validé.

## Vérification technique

- `npm test` : génération sur mesure, skill transmis au modèle, correction d’un emplacement
  manquant, faits, géométrie, WebGL, révisions et export. Les fournisseurs CLI sont des doubles
  de test ; les CLIs et comptes réels restent à vérifier sur la machine de l’utilisateur.
- `tests/e2e/personalized-studio.spec.ts` : design responsive, connexion décorée par une extension,
  absence de fallback sans IA et parcours en un clic avec un fournisseur de test configuré.
- `npm run typecheck` et `npm run build` (mode `-- --webpack` dans le cloud si nécessaire).

Le runtime logiciel des captures 3D est séparé du navigateur d’enrichissement. Les ressources
et le skill sont inclus dans la sortie Next.js standalone. Les sources et licences du moteur
sont conservées dans `vendor/premium-3d-glass/PROVENANCE.md` et `licenses/`.
