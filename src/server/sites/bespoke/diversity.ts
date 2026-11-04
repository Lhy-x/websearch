import { parse } from 'node-html-parser'
import { createHash } from 'node:crypto'
import type { BusinessFacts } from '@/lib/site/facts'
import type { QualityIssue } from '@/lib/site/bespoke-schema'

// Art direction prompts, never HTML layouts or templates. The model still chooses every section.
const LENSES = [
  'Travaillez une composition éditoriale ample, une typographie expressive et une silhouette liée au métier.',
  'Explorez une identité tactile et chaleureuse, des matières évoquées et une mise en page asymétrique.',
  'Privilégiez une narration visuelle par le geste et les prestations réelles, avec des cadrages inattendus.',
  'Imaginez une affiche contemporaine : hiérarchie forte, contrastes de tailles et scène 3D intégrée au récit.',
  'Explorez une composition calme et précise, de grands espaces et un détail graphique mémorable.',
  'Travaillez la dimension locale, le lieu et le vocabulaire propre à cette entreprise sans inventer son histoire.',
  'Proposez une expérience de galerie : rythme changeant, légendes utiles et compositions qui respirent.',
  'Explorez un langage architectural : aplats, alignements singuliers et une silhouette sculpturale justifiée.',
]
export type RecentDesign={html:string;concept:string;typography:string;layout:string;signature:string;palette:unknown}
export function creativeDirection(facts:BusinessFacts,nonce:string,recent:RecentDesign[]) {
  const index=createHash('sha256').update(facts.businessId+nonce).digest().readUInt16BE(0)%LENSES.length
  return `DIRECTIVE DE CRÉATION INDIVIDUELLE (pas un thème ni un template) : ${LENSES[index]}
Le nom « ${facts.name} », son activité précise, ses prestations publiées et les détails validés doivent guider les choix. Commence par comparer mentalement trois pistes vraiment différentes, puis retiens celle qui traduit le mieux ces faits. Ton designPlan explique ce lien avec les faits, pas seulement « moderne » ou « premium ».
Ne remplace pas seulement le nom et les couleurs d’une ancienne page : change la composition du hero, le rythme, les familles typographiques, les transitions de sections, les illustrations et le vocabulaire. Évite le même enchaînement hero + trois cartes + statistiques + contact. Aucune statistique inventée.
${recent.length?'DIRECTIONS RÉCENTES À NE PAS REPRODUIRE (références négatives uniquement, jamais des faits de cette entreprise) :\n'+JSON.stringify(recent.slice(0,8).map(({html,...plan})=>plan)):'Aucune direction récente : crée une identité singulière fondée sur le dossier.'}`
}

function normalizedCss(html:string) {
  return parse(html).querySelectorAll('style').map(node=>node.textContent).join(' ').toLowerCase().replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g,'COLOR').replace(/\s+/g,' ').trim().slice(0,100000)
}
function shingles(text:string) {const words=text.match(/-?\d*\.?\d+(?:[a-z%]+)?|[a-z_][\w-]*|[{};:]/gi)??[];const set=new Set<string>();for(let i=0;i<Math.min(words.length-4,12000);i++)set.add(words.slice(i,i+5).join(' '));return set}
function similarity(a:Set<string>,b:Set<string>){if(!a.size||!b.size)return 0;let common=0;for(const value of a)if(b.has(value))common++;return common/(a.size+b.size-common)}
function structure(html:string){const root=parse(html);root.querySelectorAll('svg,style,script').forEach(node=>node.remove());return (root.toString().match(/<([a-z][\w-]*)\b/gi)??[]).map(tag=>tag.toLowerCase()).join(' ')}
export function checkDesignDiversity(html:string,recent:RecentDesign[]):QualityIssue[] {
  const css=shingles(normalizedCss(html)),dom=structure(html)
  if(css.size<50)return []
  for(const prior of recent){const score=similarity(css,shingles(normalizedCss(prior.html)));if(score>.94&&dom===structure(prior.html))return [{code:'design_duplicate',severity:'critical',message:'La structure et les styles sont quasi identiques à une création récente, même après remplacement des couleurs. Réinvente le hero, la typographie et la composition des sections à partir des faits de ce prospect.'}]}
  return []
}
