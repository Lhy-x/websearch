import {parse} from 'node-html-parser'
import type {ArtDirection} from '@/lib/site/art-direction'
import {SYSTEM_DESIGN_FONTS} from '@/lib/site/art-direction'
import type {QualityIssue} from '@/lib/site/bespoke-schema'
import type {DesignFingerprint} from './diversity'
import {visibleText} from './checks'

const fold=(text:string)=>text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
const ignored=new Set('avec dans pour cette notre votre leurs elles ainsi entre comme aussi plus tres chez tout tous une des les aux par sur que qui est sont nous vous son ses ces cette cet'.split(' '))
function terms(text:string){return [...new Set((fold(text).match(/[a-z]{4,}/g)??[]).filter(word=>!ignored.has(word)).map(word=>word.slice(0,Math.min(6,word.length))))]}

export function checkPersonalization(html:string,direction:ArtDirection,fingerprint?:DesignFingerprint):QualityIssue[]{
 const issues:QualityIssue[]=[]
 const rich=direction.evidence.filter(item=>['publicDetails','officialText'].includes(item.id)||item.id.startsWith('detail.'))
 const content=fold(visibleText(html))
 if(rich.length&&rich.every(item=>{const words=terms(item.quote);return words.length>=2&&words.filter(word=>content.includes(word)).length<Math.min(2,words.length)}))issues.push({code:'design_facts_unused',severity:'critical',message:'La rédaction ignore les informations distinctives citées dans le plan. Reprends explicitement au moins un détail public validé (prestations ou particularités publiées), au lieu de rester sur un texte générique du métier. N’invente rien.'})
 const css=parse(html).querySelectorAll('style').map(node=>node.textContent).join(' ')
 const expected=[direction.concept.typography.display,direction.concept.typography.body]
 if(expected.some((font,index)=>!fold(fingerprint?.fonts[index]??css).includes(fold(font))))issues.push({code:'design_typography_ignored',severity:'critical',message:`La typographie prévue pour cette identité n’est pas appliquée : titre ${expected[0]}, texte ${expected[1]}. Applique ces familles réellement dans le CSS et les éléments concernés, avec des replis lisibles.`})
 const fontUrls=[...parse(html).querySelectorAll('link[rel="stylesheet"]').map(node=>node.getAttribute('href')??''),...(css.match(/https:\/\/fonts\.googleapis\.com\/[^\s'"\)]+/g)??[])]
 const loaded=new Set(fontUrls.flatMap(value=>{try{const url=new URL(value.replaceAll('&amp;','&'));return url.hostname==='fonts.googleapis.com'?url.searchParams.getAll('family').flatMap(family=>family.split('|').map(name=>fold(name.split(':')[0]!))):[]}catch{return []}}))
 const missing=expected.filter(font=>!(SYSTEM_DESIGN_FONTS as readonly string[]).includes(font)&&!loaded.has(fold(font)))
 if(missing.length)issues.push({code:'design_font_missing',severity:'critical',message:`Les polices ${missing.join(', ')} sont nommées mais leur chargement est absent. Ajoute les liens Google Fonts correspondants : une police déclarée sans source retombe sur la même police de secours.`})
 return issues
}
