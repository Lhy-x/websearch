# Le moteur

HTML, CSS et JavaScript natifs. Three.js r160 et son `SVGLoader` sont inclus localement.
Pas de framework, pas de build, pas de dépendance réseau, aucune image : tout ce qui
s'affiche est calculé à l'image. Une seule police, Space Grotesk.

## Verre

`MeshPhysicalMaterial` en transmission totale, rugosité 0.025, IOR 1.46, iridescence,
vernis. Les reflets viennent d'un studio de panneaux lumineux converti en environnement
par `PMREMGenerator`. Three.js r160 n'a pas de paramètre de dispersion : `onBeforeCompile`
remplace le bloc de transmission pour échantillonner trois réfractions, l'indice du rouge
diminué et celui du bleu augmenté, l'écart se renforçant aux angles rasants. Toute
montée de version de Three.js impose de revérifier cette greffe.

## Découpage automatique

`parseShape` classe les contours d'un SVG : pourtour, trous, solides séparés.
`partitionContour` coupe le pourtour en secteurs radiaux depuis son centre. L'angle de
départ est choisi par balayage : gagne celui dont le pire fragment a le plus grand noyau
de visibilité. C'est ce qui permet au moteur d'accepter une forme qu'il n'a jamais vue.
Avec une seule forme, le cas normal, source et cible sont la même silhouette : chaque
fragment revient exactement d'où il est parti, et la correspondance est l'identité. En
mode deux formes, les fragments sont triés par angle puis appariés dans l'ordre, ce qui
donne des trajets courts.

`matchMorphContours` construit la correspondance point à point, radialement autour du
noyau si possible, sinon par abscisse curviligne avec un avertissement en console.

## Chronologie du scroll

| Scroll | État |
|---|---|
| 0 → 12 % | Forme assemblée, trous compris |
| 12 → 28 % | Les quatre fragments s'écartent, la caméra recule |
| 28 → 40 % | Fragments séparés |
| 40 → 54 % | Les fragments reviennent à leur place |
| 54 → 60 % | Prisme unique, biseaux qui grandissent, trous qui se percent |
| 60 → 100 % | Forme recomposée, en verre, identique au départ |
| au-delà | Chapitre contact : l'objet dérive en haut à gauche, une dalle de verre se cale derrière le formulaire |

Le corps mesure 900vh pour la partie cinématique ; la section contact suit dans le flux.

## Réglages utiles

Dans `js/app.js` :

- `SITE.shapes`, `SITE.palette`, `SITE.fragments` — la configuration écrite par le builder.
  `shapes` contient une seule entrée dans le cas normal ; deux entrées réactivent le
  morphing d'une forme vers une autre
- `LOGO_HEIGHT`, `LOGO_DEPTH`, `LOGO_BEVEL` — taille, épaisseur et biseau de l'objet.
  Avec une seule forme, `ICON_SIZE`, `ICON_DEPTH` et `ICON_BEVEL` s'y alignent d'eux-mêmes
  et ne comptent qu'en mode deux formes
- Le biseau reste à garder sous la taille du plus petit détail de la forme
- `cameraFrame` — cadrage. En paysage, un poids par chapitre décale l'objet
  latéralement pour dégager le texte ; en portrait la caméra recule et l'objet alterne
  moitié haute et moitié basse, en accord avec la mise en page empilée du CSS.
- `SLIDE_MIN_SHOW`, `SLIDE_LEAVE_HOLD` — combien de temps un texte reste affiché quand on
  scrolle vite

Dans `css/styles.css` : le header, les positions des quatre chapitres, la carte de
contact, le curseur réticule et le préchargeur.

## Contrôle qualité

`window.__glassSite.snap(v)` place le scroll lissé à la position `v`,
`snapContact(c)` fait de même dans le chapitre contact, `pieces` liste les fragments,
`mailto()` renvoie le lien construit par le formulaire. Ces crochets servent aux
captures automatisées et peuvent être retirés en production.

## Limites connues

- Si la forme a des trous, ils disparaissent le temps de l'éclatement :
  les fragments sont pleins. Sans conséquence sur une forme sans trou.
- La recomposition reconstruit des géométries à chaque image entre 40 et 54 % du scroll.
  C'est le moment le plus lourd ; à mesurer sur machine modeste.
- Testé sur Chrome. Safari et Firefox n'ont pas été vérifiés.
