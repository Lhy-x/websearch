import { readFile } from 'node:fs/promises'
import type { BusinessFacts } from '@/lib/site/facts'
import { BESPOKE_SYSTEM, buildBespokePrompt } from './prompt'

/** The provided skill is an input to art direction; its interview and invented metrics are overridden. */
export async function personalizedSystem(): Promise<string> {
  const [skill,shapes]=await Promise.all(['SKILL.md','references/shapes.md'].map(f=>readFile(`vendor/premium-3d-glass/${f}`,'utf8')))
  return `${BESPOKE_SYSTEM}

MODE ATELIER PERSONNALISÉ — LES RÈGLES CI-DESSOUS PRÉCISENT LE LIVRABLE.
Tu disposes du skill Premium 3D Glass fourni par l'utilisateur :
<skill_fourni>\n${skill}\n</skill_fourni>
<geometrie>\n${shapes}\n</geometrie>

Adaptation prioritaire à cette application : le dossier remplace toute interview. Ne pose aucune question. N'utilise AUCUN template HTML, aucune grille de sections obligatoire, aucun thème du catalogue. Crée une direction artistique et une composition nouvelles, propres au métier, au nom, à la ville et au contenu vérifié de CE prospect. Le skill sert de langage de matière (verre optique, réfraction, silhouette lisible, fragments, scroll), pas de maquette à remplir. Varie réellement architecture, typographie, rythme, positions et couleurs entre entreprises.
N'invente JAMAIS de statistiques, de témoignages ou de coordonnées, même si le skill suggère des placeholders chiffrés. Aucun formulaire sans backend : liens tel:/mailto: vérifiés.
Rends le HTML complet et le plan de design comme auparavant. Ajoute glassScene : silhouette SVG ORIGINALE fermée, simple, sans texte, un contour principal, sans chevauchement, sans trou ni transform ; palette de trois hexadécimaux ; description accessible. Crée ce symbole pour cette activité, sans le présenter comme le logo officiel.
Dans le HTML, insère EXACTEMENT UN <div data-glass-scene aria-label="Description" style="min-height:360px"></div> à l'endroit le plus pertinent de ta composition (hero asymétrique, scène centrale ou section immersive). Son illustration statique et sa 3D sont injectées par le moteur fiable. Ne produis aucun script, canvas, iframe ou lien JS/CDN. Ne dessine pas une fausse 3D en CSS à la place de cet emplacement.
La page doit rester magnifique et utilisable sans mouvement : contenu dans le DOM, aucun texte masqué en attendant JS, navigation clavier, contraste AA, aucun débordement à 390 px. Le bloc 3D peut avoir ta propre couleur de fond et tes bordures ; sa taille reste responsive. Les textes, les contacts et les CTA demeurent en HTML autour de la scène. Sois ambitieux : composition éditoriale, titres expressifs, espaces intentionnels, détails soignés, plutôt que l'empilement habituel de cartes.`
}

export function personalizedBrief(facts: BusinessFacts, customInstructions: string): string {
  return buildBespokePrompt(facts,{customInstructions}) + '\nCommande : concevoir le site sur mesure complet de ce prospect, sans catalogue ni template. Le site sera livré directement après contrôle et critique visuelle. Choisis toi-même la silhouette, le style et la mise en page. Renvoie aussi glassScene.'
}
