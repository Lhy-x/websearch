---
name: premium-3d-glass
description: Génère un site vitrine « Premium 3D Glass » sur mesure — une page cinématique au scroll où un objet en verre 3D (Three.js, réfraction et dispersion réelles) — le logo du client ou une forme choisie — se décompose puis se recompose, avec header, chapitres Accueil / À propos / Services / Résultats et formulaire de contact en verre. Le skill interviewe l'utilisateur (entreprise, secteur, activité, e-mail, logo, objet 3D), rédige le contenu et livre le site prêt à héberger. Utiliser quand quelqu'un veut un site vitrine haut de gamme, une landing page 3D, un site en verre, ou lance /premium-3d-glass.
---

# Premium 3D Glass — site vitrine 3D sur mesure

Un moteur WebGL prêt à l'emploi : une silhouette en verre optique — le logo du client ou
une forme choisie — qui éclate en quatre fragments au scroll puis se recompose à
l'identique, sur cinq chapitres. Tout est rendu en temps réel, sans image ni vidéo. Le
travail consiste à **interviewer**, **choisir la forme**, **écrire le contenu**,
**construire** et **vérifier**.

Le moteur est déjà écrit et testé. Ne le réécris pas : remplis-le.

## Étape 1 — Interviewer

Deux formulaires `AskUserQuestion`, dans cet ordre, et rien d'autre : aucune question dans
le chat. Écris ensuite tout le contenu **dans la langue de l'utilisateur**.

### Formulaire 1 — les infos (un seul `AskUserQuestion`, quatre questions)

1. **« Nom de l'entreprise »**
2. **« Secteur d'activité »** — quatre familles à cocher, par exemple « Tech, cloud, SaaS »,
   « Bâtiment, immobilier, industrie », « Santé, bien-être, services aux particuliers »,
   « Conseil, marketing, création » ; tout autre secteur passe par le champ « Autre ».
3. **« Décris ton activité : ce que tu fais, pour qui »**
4. **« L'adresse e-mail de contact »**

Les questions 1, 3 et 4 sont ouvertes : la réponse arrive par le champ « Autre ». Comme le
formulaire exige des options, donne-leur deux options neutres, « Je l'écris dans Autre » et
« À définir plus tard, mets un texte provisoire », et rien d'autre. N'ajoute aucune
explication à ces questions : ni pourquoi tu demandes, ni ce que le site en fera, ni comment
fonctionne le formulaire de contact. Ne réclame **jamais** de chiffres à l'utilisateur.

### Formulaire 2 — le logo ou la forme (un seul `AskUserQuestion`, deux questions)

1. **« Que souhaites-tu afficher sur ton site ? »** — deux options seulement, avec ces
   descriptions exactes, mot pour mot :
   - **« Mon logo »**, description : « Importez votre logo dans le chat ». Le logo va dans
     le header **et** son symbole, détouré, devient l'objet en verre. Demande ensuite le
     fichier en une ligne, et **ne demande pas le format** : tu prends le fichier tel qu'il
     vient (SVG, PNG, JPG, PDF…) et tu te débrouilles : détourage du symbole, suppression
     du fond, vectorisation si nécessaire. Côté utilisateur, un seul fichier à déposer,
     rien d'autre.
   - **« Une autre forme 3D »**, description : « Décris-la dans Autre (un éclair, une
     flèche…) ». La forme arrive par le champ « Autre ». Si l'option est cochée sans
     description, demande la forme en une ligne ; si la description reste vague, choisis
     toi-même la forme qui lui correspond, sans le dire. Le header garde alors la marque par
     défaut (`template/assets/brand/mark.svg`, une étoile à huit branches) suivie du nom de
     l'entreprise à droite : signature neutre qui va à tous les secteurs.

   Un seul objet, le même du début à la fin du scroll ; il se décompose puis se recompose
   aux chapitres 2 et 3.

   **Ne mentionne jamais la bibliothèque de formes, ni son existence, ni son contenu** :
   c'est ta réserve interne, pas un catalogue à faire choisir. L'utilisateur te fait
   confiance ; s'il a une idée, il te la propose.
2. **« Couleurs de marque pour le dégradé de fond ? »** — palette par défaut (bleu →
   carmin le long du scroll) ou une ou deux couleurs de marque.

### Après les deux formulaires

Tu construis le site **directement**. Aucune étape intermédiaire : pas d'aperçu de la
forme à faire valider, pas de maquette, pas de question de confirmation. L'utilisateur
découvre le site fini, puis demande ses corrections.

## Étape 2 — Choisir la forme

Une seule silhouette pour tout le site : assemblée au chapitre 1, éclatée en quatre
fragments aux chapitres 2 et 3, recomposée à l'identique, et gardée jusqu'au contact.
Le retour est une identité, donc plus de morphing entre deux formes ni de filament
possible : ce qui compte, c'est que la forme tienne en verre.

Une forme ne rend en verre que si sa **silhouette se lit d'un coup d'œil**. Et surtout :
**juge-la rendue en verre, jamais à plat.** Une silhouette qui paraît quelconque en
aplat peut être superbe une fois extrudée et éclairée, et l'inverse est vrai aussi.

```bash
cd template && python3 serve.py 5181
# puis, dans le navigateur :
#   http://127.0.0.1:5181/tools/preview.html?dir=../assets/library&names=bolt,ring,cloud
```

`tools/preview.html` rend chaque forme avec le verre, le studio et le fond du site.
C'est **ton** outil de jugement, pas une étape de validation : regarde l'aperçu
toi-même, tranche, et construis. Ne le montres pas à l'utilisateur avant la livraison —
il découvre le site fini.

### Trois sources, dans cet ordre

1. **La bibliothèque**, 30 silhouettes prêtes dans `template/assets/library/` :

   ```bash
   ls template/assets/library | sed 's/.svg//'
   ```

   `arch arrow-diagonal arrow-up bloom bolt burst cloud code cross cursor flash gear
   growth hexagon home like palette pebble pen person prism ring settings shield
   shield-check spark squircle star star-soft wave`

2. **Le logo de l'utilisateur.** Vérifie-le d'abord :

   ```bash
   python3 template/tools/make_shape.py --check-file /chemin/logo.svg
   ```

   Il faut `crossings 0`. **Si le logo contient le nom de la marque**, et que
   l'utilisateur veut son logo comme objet en verre, détoure d'abord le symbole :

   ```bash
   python3 template/tools/make_shape.py --extract-icon /chemin/logo.svg /tmp/marque.svg
   ```

   La commande sépare les groupes de contours, reconnaît le bloc de lettres à sa
   régularité de hauteur, et ne garde que le symbole. Elle dit combien de contours elle
   a écartés : vérifie l'aperçu en verre, et si le découpage s'est trompé, découpe le
   fichier à la main. **Le format d'entrée n'est pas le problème de l'utilisateur** :
   pour un PNG, un JPG ou un PDF, supprime le fond, isole le symbole et redessine la
   silhouette en vecteur toi-même — un raster ne se vectorise pas proprement au pixel.
   Tu juges le résultat en verre et tu construis, sans faire valider.

3. **Une forme sur mesure que tu dessines.** Ajoute une fonction dans
   `template/tools/make_shape.py` (aides `fillet`, `circle`, `soften`, `smooth_closed`,
   `polar`, `ribbon`), enregistre-la dans `SHAPES`, valide avec `--check`, exporte-la
   dans la bibliothèque, puis regarde-la en verre. Lis `references/shapes.md` avant :
   il contient les pièges géométriques qui produisent des filaments à l'extrusion.

### Association secteur → forme, à adapter

| Secteur | Forme |
|---|---|
| Tech, SaaS, cloud | `cloud`, `code` ou `hexagon` |
| Énergie, électricité | `flash` ou `bolt` |
| Bâtiment, immobilier | `home` ou `arch` |
| Santé, bien-être | `cross` ou `like` |
| Écologie, jardin | `bloom` ou `pebble` |
| Sécurité, assurance, droit | `shield` ou `shield-check` |
| Design, création | `pen` ou `palette` |
| Marketing, croissance | `growth` ou `arrow-up` |
| Luxe, conseil | `spark` ou `prism` |
| Industrie, maintenance | `gear` ou `settings` |
| Services aux particuliers | `person` ou `like` |

## Étape 3 — Écrire le contenu

Copie `template/site.example.json`, remplis-le. `shape` reçoit un nom de la bibliothèque
ou le chemin d'un SVG (le symbole du logo détouré, par exemple) ; `mark`, optionnel, le
chemin du logo complet pour le header. Contraintes de rédaction :

- **Titres** : exactement deux lignes, la seconde s'affiche en gris. **Maximum 18
  caractères par ligne**, sinon le titre passe sur trois lignes et déborde.
- **Accroche** (hero) : deux phrases, ce que vous faites et pour qui.
- **À propos** : trois ou quatre phrases, concrètes. Pas de « leader innovant ».
- **Services** : exactement quatre bénéfices, une phrase chacun, avec une icône parmi
  `spark shield clock chart check people target leaf wrench lock globe code phone star
  truck euro`.
- **Résultats** : exactement trois chiffres. `value` est un nombre, `decimals` le nombre
  de décimales, `suffix` l'unité (` %`, ` min`, `+`), `label` la légende sur deux lignes
  avec `<br>`. **Ne demande jamais ses chiffres à l'utilisateur.** Propose-en trois,
  plausibles pour le secteur et cohérents entre eux, en placeholder : il les corrigera
  ensuite. Dis-lui à la livraison que ces trois chiffres sont à remplacer par les siens,
  et où les modifier.
- **Contact** : titre en deux lignes, une invitation courte.
- Le formulaire ouvre la messagerie du visiteur avec un message prérempli. Il ne
  nécessite aucun serveur, donc le site s'héberge n'importe où.

## Étape 4 — Construire

```bash
cd template && python3 tools/build_site.py site.json --out ~/Desktop/mon-site
```

Le script copie le moteur, génère la forme, insère la marque, la palette et tout
le texte, puis produit `version-monofichier.html`. Relance-le après chaque correction :
il est idempotent.

## Étape 5 — Vérifier avant de livrer

Obligatoire. Lance le serveur et regarde le résultat :

```bash
cd ~/Desktop/mon-site && python3 serve.py 5180
```

Contrôle, à 0 %, 34 %, 62 %, 94 % du scroll puis dans le contact :

- l'objet en verre apparaît, s'éclate en quatre fragments puis se recompose exactement,
  sans filament ni saut de taille ;
- aucun texte n'est recouvert par la 3D ;
- les titres tiennent sur deux lignes ;
- la console n'a pas d'erreur ;
- la mise en page tient sur téléphone (390 × 844).

`window.__glassSite.snap(0.62)` place le scroll instantanément,
`window.__glassSite.pieces` liste les fragments. Si un fragment n'a pas de noyau de
visibilité, la console prévient et le morphing bascule sur une méthode de secours :
le rendu reste correct mais la forme est peut-être trop complexe.

## Étape 6 — Livrer

Le site s'ouvre tout seul : l'utilisateur ne doit **jamais** avoir à copier une commande
pour le voir. Laisse tourner le serveur de l'étape 5 en arrière-plan (ou relance-le avec
`run_in_background`), puis ouvre l'adresse toi-même, dans le panneau navigateur de Claude
et dans son navigateur par défaut :

```bash
open http://127.0.0.1:5180
```

Donne ensuite à l'utilisateur : l'adresse locale qui vient de s'ouvrir, le dossier,
`version-monofichier.html` pour un envoi par e-mail ou un double-clic, et les trois endroits
à modifier plus tard (le texte dans `index.html`, l'adresse e-mail, la forme dans
`assets/shapes/shape.svg`). Explique en une phrase qu'`index.html` a besoin d'un serveur
(local ou en ligne) et que la version monofichier, elle, s'ouvre directement. Signale
explicitement que **les trois chiffres du chapitre Résultats sont des placeholders** à
remplacer par les siens, et montre la ligne où les changer. Propose la mise en ligne s'il a
un hébergeur.

## Références

- `references/shapes.md` — écrire une forme qui tient en verre, et les pièges géométriques
- `references/engine.md` — comment le moteur fonctionne et quoi régler
- `template/tools/preview.html` — voir n'importe quelle forme en verre avant de décider
