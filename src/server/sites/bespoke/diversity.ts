import {parse} from 'node-html-parser'
import type {BusinessFacts} from '@/lib/site/facts'
import type {QualityIssue} from '@/lib/site/bespoke-schema'
import type {ArtDirection} from '@/lib/site/art-direction'
import type {GlassScene} from '@/lib/site/glass-scene'

export type DesignFingerprint={version:1;sourceHash?:string;hero:number[];sections:number[][];fonts:string[]}
export type RecentDesign={website_id?:string;html:string;concept:string;typography:string;layout:string;signature:string;palette:unknown;scene?:GlassScene|null;direction?:ArtDirection|null;fingerprint?:DesignFingerprint|null}

function tokens(text:string){return text.match(/-?\d*\.?\d+(?:[a-z%]+)?|[a-z_][\w-]*|[{};:]/gi)??[]}
function shingles(words:string[],size=4){const set=new Set<string>();for(let i=0;i<=Math.min(words.length-size,14000);i++)set.add(words.slice(i,i+size).join(' '));return set}
function similarity(a:Set<string>,b:Set<string>){if(!a.size||!b.size)return 0;let same=0;for(const item of a)if(b.has(item))same++;return same/(a.size+b.size-same)}
function cssOf(html:string){return parse(html).querySelectorAll('style').map(node=>node.textContent).join(' ').toLowerCase().replace(/\/\*[\s\S]*?\*\//g,'').slice(0,160000)}
function withoutColors(css:string){return css.replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g,'COLOR').replace(/--[\w-]+/g,'VARIABLE').replace(/\s+/g,' ')}
function layoutCss(css:string){return [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)].filter(([,property])=>/^(display|position|grid[-\w]*|flex[-\w]*|align[-\w]*|justify[-\w]*|gap|(?:row|column)-gap|(?:min-|max-)?(?:width|height)|margin[-\w]*|padding[-\w]*|text-align|border-radius|transform)$/.test(property!)).map(([,property,value])=>`${property}:${value!.replace(/var\([^)]*\)/g,'VAR').replace(/(-?\d*\.?\d+)(px|rem|em|%)/g,(_,n,unit)=>`${unit==='px'?Math.round(Number(n)/4)*4:Math.round(Number(n)*5)/5}${unit}`)}`).join(';')}
function structure(html:string){const root=parse(html);root.querySelectorAll('svg,style,script,noscript').forEach(node=>node.remove());return (root.toString().match(/<([a-z][\w-]*)\b/gi)??[]).map(tag=>tag.slice(1).toLowerCase()).filter(tag=>!['div','span','article'].includes(tag))}
function rectSimilarity(a:number[],b:number[]){
 if(a.length!==b.length||!a.length)return 0
 let total=0,count=0
 for(let start=0;start<a.length;start+=4){
  const first=a.slice(start,start+4),second=b.slice(start,start+4)
  const missingA=first.every(value=>value===-1),missingB=second.every(value=>value===-1)
  if(missingA&&missingB)continue
  count+=first.length
  if(missingA||missingB)continue
  total+=first.reduce((sum,value,index)=>sum+Math.max(0,1-Math.abs(value-second[index]!)/.18),0)
 }
 return count?total/count:0
}
export function layoutSimilarity(a:DesignFingerprint,b:DesignFingerprint){
 if(a.version!==1||b.version!==1)return 0
 const hero=rectSimilarity(a.hero,b.hero),count=Math.max(a.sections.length,b.sections.length)
 const flow=count?a.sections.reduce((total,box,index)=>total+(b.sections[index]?rectSimilarity(box,b.sections[index]!):0),0)/count:0
 return hero*.65+flow*.35
}
function silhouetteKey(scene:GlassScene){return parse(scene.silhouette).querySelectorAll('path,polygon,rect,circle,ellipse').map(node=>Object.entries(node.attributes).filter(([key])=>['d','points','x','y','width','height','rx','ry','cx','cy','r'].includes(key)).map(([key,value])=>key+':'+value.toLowerCase().replace(/[\s,]+/g,' ')).sort().join('|')).join(';')}
function repeatedScene(a:GlassScene,b:GlassScene){
 if(silhouetteKey(a)!==silhouetteKey(b))return false
 const first=a.presentation,second=b.presentation
 if(!first||!second)return !first&&!second
 return first.fragments===second.fragments&&first.accent===second.accent&&first.transparent===second.transparent&&Math.abs(first.rotation-second.rotation)<.12&&Math.abs(first.spread-second.spread)<.15&&Math.abs(first.turn-second.turn)<.15
}
export function describeDesign(prior:RecentDesign){return {concept:prior.direction?.concept??{concept:prior.concept,typography:prior.typography,layout:prior.layout,signature:prior.signature,palette:prior.palette},structure:structure(prior.html).filter(tag=>/^(h[1-3]|section|ul|li|details|img|aside|nav)$/.test(tag)).slice(0,60),scene:prior.scene?{description:prior.scene.description,presentation:prior.scene.presentation}:null}}

/** A prompt has no random theme/lens: its references are observations of other creations. */
export function creativeDirection(facts:BusinessFacts,_nonce:string,recent:RecentDesign[]){return `Le site concerne uniquement « ${facts.name} ». Conçois sa structure à partir de ses faits. Ne remplace pas simplement les textes, la palette ou les classes d’une autre page. Les références suivantes décrivent les créations voisines et ne sont jamais des faits de ce prospect :\n${JSON.stringify(recent.map(describeDesign))}`}

export function checkDesignDiversity(html:string,recent:RecentDesign[],options:{fingerprint?:DesignFingerprint;scene?:GlassScene}={}):QualityIssue[]{
 const css=cssOf(html),full=shingles(tokens(withoutColors(css))),layout=shingles(tokens(layoutCss(css))),dom=structure(html),tree=shingles(dom,3)
 for(const prior of recent){
  if(!prior.html)continue
  const otherCss=cssOf(prior.html),otherDom=structure(prior.html)
  const styleScore=similarity(full,shingles(tokens(withoutColors(otherCss)))),layoutScore=similarity(layout,shingles(tokens(layoutCss(otherCss)))),treeScore=similarity(tree,shingles(otherDom,3))
  const sameStructure=dom.join(' ')===otherDom.join(' ')
  const rendered=options.fingerprint&&prior.fingerprint?layoutSimilarity(options.fingerprint,prior.fingerprint):null
  if(full.size>=8&&(rendered===null||rendered>.72)&&(styleScore>.9&&(sameStructure||treeScore>.84)||layout.size>20&&layoutScore>.86&&treeScore>.88)||rendered!==null&&rendered>.96&&treeScore>.82&&layoutScore>.65){
   return [{code:'design_duplicate',severity:'critical',message:'Cette page reprend la composition d’une création voisine : structure, géométrie ou organisation des styles trop proches. Changer les couleurs, les polices, les classes ou ajouter des conteneurs ne suffit pas. Repars d’une nouvelle ouverture et d’un rythme de sections lié aux faits de ce prospect.'}]
  }
  if(options.scene&&prior.scene&&repeatedScene(options.scene,prior.scene))return [{code:'design_scene_reused',severity:'critical',message:'La même silhouette et la même mise en scène 3D sont déjà utilisées. Dessine une silhouette spécifique aux faits du prospect et compose-la selon sa direction artistique.'}]
 }
 return []
}
