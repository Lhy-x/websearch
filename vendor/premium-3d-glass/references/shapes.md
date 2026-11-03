# Écrire une forme qui tient en verre

Le moteur extrude une silhouette 2D en un prisme biseauté, puis la découpe en fragments
qui volent et se déforment. Une forme qui marche à plat peut échouer en 3D. Voici les
règles, et les pièges vérifiés en pratique.

## Ce qui se lit en verre

- Une silhouette reconnaissable **en un coup d'œil**, à 200 px de large.
- Aucun trait plus fin que **5 % de la largeur totale** : le biseau le mange.
- Pas de texte, pas de dégradé, pas de détail intérieur. Le verre ajoute déjà des
  reflets, des caustiques et de la dispersion : la forme doit rester nue.
- Un trou éventuel doit faire au moins **15 % de la largeur**. Il n'est percé qu'à la
  fin, une fois les fragments fusionnés.

## Le piège des arcs de cercle

Pour une étoile à quatre branches, relier deux pointes voisines par un **arc de cercle**
semble naturel. C'est faux : l'arc passe de l'autre côté de l'axe juste sous la pointe,
les deux côtés d'une même branche se croisent, et l'extrusion produit un filament de
verre au bout de chaque branche.

La parade est d'utiliser des **cubiques dont les points de contrôle pointent vers le
centre** de la forme. Chaque côté reste alors dans le triangle formé par ses deux pointes
et le centre : les côtés ne peuvent plus se croiser. Voir `star4()` dans
`tools/make_shape.py`.

Règle générale : construis chaque côté dans une région convexe qui lui est propre.

## Les pointes

Une pointe parfaitement aiguë s'accommode mal d'un biseau. Deux options :

- **Congé tangent** : remplace le sommet par un arc de rayon `r`, à condition que
  `r` reste supérieur à la taille du biseau (`ICON_BEVEL`, 0.028 unité monde).
- **Adoucissement quadratique** (`soften` dans `make_shape.py`) : remplace les points à
  moins de `width` du sommet par une quadratique qui passe par lui. Elle reste dans le
  triangle de ses ancres, donc elle ne peut pas créer de croisement. C'est la méthode la
  plus sûre.

## Le noyau de visibilité

Le morphing associe les contours en tirant des rayons depuis un point intérieur. Ce point
doit **voir tout le contour** : c'est le noyau de visibilité. Un carré a un noyau égal à
lui-même, une étoile un petit noyau central, une forme en L ou en croissant n'en a pas.

`make_shape.py --check` affiche le pourcentage. En dessous de quelques pour cent, le
moteur bascule automatiquement sur une correspondance par abscisse curviligne : ça marche,
mais le morphing peut plier sur des formes très différentes. Le découpage en fragments
choisit d'ailleurs son angle de départ en maximisant ce noyau.

## Le format de sortie

Un SVG, `viewBox="0 0 1000 1000"`, un seul `<path>` avec `fill-rule="evenodd"` :
le plus grand contour est le pourtour, ceux qui sont à l'intérieur sont des trous, les
autres sont des solides séparés (la feuille d'une pomme, le point d'un i).

## La bibliothèque

`template/assets/library/` contient 30 silhouettes au format normalisé. Dix-sept
viennent d'un jeu d'icônes pleines importé avec `--import`, treize sont paramétriques et
vivent dans `make_shape.py`. Pour en ajouter une, il suffit de déposer un SVG normalisé
dans ce dossier : `build_site.py` le trouvera par son nom de fichier.

## Détourer un logo qui contient le nom

`--extract-icon` groupe les contours par proximité horizontale, repère le groupe qui
ressemble à du texte (au moins trois contours de hauteur régulière) et ne garde que le
symbole. Vérifie toujours le résultat en verre : sur un logo où le mot est plus gros que
le symbole, l'heuristique peut se tromper, et il vaut mieux découper à la main.

## Valider

```bash
python3 tools/make_shape.py --check              # les formes paramétriques
python3 tools/make_shape.py --check-file x.svg   # un fichier quelconque
```

Il faut `crossings 0`. Un contour qui se croise donnera des filaments à l'extrusion.
Le lecteur accepte `M L H V C S Q T A Z`, donc les arcs elliptiques et les courbes de
Bézier ; il refuse un SVG sans `<path>`, donc aplatis les contours et les formes
primitives avant d'exporter. Les contours livrés deux fois sont écartés automatiquement.

Et surtout, la validation numérique ne remplace pas l'œil : ouvre
`tools/preview.html` et regarde la forme **en verre** avant de la retenir.
