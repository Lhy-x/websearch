Moteur Premium 3D Glass fourni par l’utilisateur dans premium-3d-glass-skill.zip.
Code original conservé ; adaptation et configuration dans src/server/sites/glass/.
Three.js et SVGLoader : MIT (licenses/Three-MIT.txt). Space Grotesk : OFL (licenses/Space-Grotesk-OFL.txt).
Le moteur et le modèle fournis ne déclarent pas de licence générale : aucune licence des dépendances ne leur est attribuée par extension. Vérifier les droits du modèle avant redistribution publique.

Le runtime personnalisé `personalized-runtime.js` est une adaptation du projet. Il réutilise les primitives géométriques et le matériau optique de `js/app.js`, sans reprendre son layout. SKILL.md et references/ conservent les documents fournis par l’utilisateur.

La présentation personnalisée accepte désormais des paramètres bornés par création (fragments, profondeur, rotation, mouvement, lumière, transparence et accent facultatif). Ils sont exécutés uniquement par personalized-runtime.js ; aucun JavaScript généré par le modèle n’est exécuté. Les versions sans paramètres conservent la présentation initiale.
