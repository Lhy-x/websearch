import {describe,expect,it} from 'vitest'
import {extractPage,extractPublicBlocks} from '@/server/enrich/html-extract'
import {applySummarySelection,isAdvantage,summarizeSources,type SummaryInput} from '@/server/enrich/summary'
import {mapOsm} from '@/server/connectors/osm'

const input:SummaryInput={business:{name:'TEST Atelier Rivage',sector:'hair_salon',city:'Rouen'},builtFromAt:'2026-01-01T12:00:00.000Z',candidates:[
 {id:'s1',text:'Notre atelier fabrique des meubles en chêne et restaure les sièges anciens.',advantage:false,evidence:{kind:'website',label:'Notre savoir-faire',url:'https://atelier.example.test/services',excerpt:'Notre atelier fabrique des meubles en chêne et restaure les sièges anciens.'}},
 {id:'s2',text:'Chaque meuble est réalisé sur mesure dans notre atelier.',advantage:true,evidence:{kind:'website',label:'Nos engagements',url:'https://atelier.example.test/engagements',excerpt:'Chaque meuble est réalisé sur mesure dans notre atelier.'}},
 {id:'s3',text:'Nous ne proposons pas de livraison.',advantage:true,evidence:{kind:'website',label:'Services',url:'https://atelier.example.test/services',excerpt:'Nous ne proposons pas de livraison.'}},
]}

describe('source-grounded business recaps',()=>{
 it('preserves real services and advantages with their original source, excluding denials',()=>{
  const summary=summarizeSources(input)
  expect(summary.activity.text).toBe(input.candidates[0]!.text)
  expect(summary.advantages.map(item=>item.text)).toEqual([input.candidates[1]!.text])
  expect(summary.advantages[0]!.evidence[0]!.url).toBe('https://atelier.example.test/engagements')
  expect(summary.coverage).toBe('documented')
 })
 it('leaves missing advantages empty instead of inventing generic quality or price promises',()=>{
  const summary=summarizeSources({...input,candidates:[]})
  expect(summary.activity.text).toContain('Coiffeur')
  expect(summary.activity.evidence[0]!.kind).toBe('record')
  expect(summary.advantages).toEqual([])
  expect(summary.coverage).toBe('limited')
 })
 it('accepts only AI excerpts actually present in the cited source and deduplicates them',()=>{
  const selected=applySummarySelection(input,{activity:[{sourceId:'s1',excerpt:input.candidates[0]!.text}],advantages:[
   {sourceId:'s2',excerpt:'Chaque meuble est réalisé sur mesure'},
   {sourceId:'s2',excerpt:'Chaque meuble est réalisé sur mesure'},
   {sourceId:'s3',excerpt:'Nous ne proposons pas de livraison.'},
   {sourceId:'unknown',excerpt:'Une garantie de satisfaction totale'},
  ]})
  expect(selected.advantages.map(item=>item.text)).toEqual(['Chaque meuble est réalisé sur mesure'])
  expect(selected.advantages[0]!.evidence[0]!.excerpt).toBe(selected.advantages[0]!.text)
  expect(selected.method).toBe('ai_selection')
  const invented=applySummarySelection(input,{activity:[{sourceId:'s1',excerpt:'La meilleure équipe de France'}],advantages:[]})
  expect(invented.method).toBe('sources')
  expect(invented.activity.text).toBe(input.candidates[0]!.text)
 })
 it('allows semantic AI selection of a real distinct benefit beyond predefined keywords',()=>{
  const text='Les réparations sont effectuées directement dans notre atelier ouvert au public.'
  const rich={...input,candidates:[{...input.candidates[0]!,text}]}
  const summary=applySummarySelection(rich,{activity:[],advantages:[{sourceId:'s1',excerpt:text}]})
  expect(summary.advantages[0]!.text).toBe(text)
 })
 it('does not mistake negative delivery statements or questions for advantages',()=>{
  expect(isAdvantage('Nous ne proposons pas de livraison.',true)).toBe(false)
  expect(isAdvantage('Besoin de livraison ?',true)).toBe(false)
  expect(isAdvantage('Produits locaux et plats faits maison.')).toBe(true)
 })
})

it('reads service paragraphs and benefit context without hidden, legal or executable text',()=>{
 const html=`<head><title>Atelier</title></head><nav><p>Navigation inutile et promotion.</p></nav>
 <main><section><h2>Notre activité</h2><p>${input.candidates[0]!.text}</p></section>
 <section><h2>Pourquoi nous choisir ?</h2><p>${input.candidates[1]!.text}</p></section>
 <div hidden><p>SECRET HIDDEN Livraison gratuite.</p></div><script>Livraison garantie</script>
 <div id="cookie-banner"><p>SECRET COOKIE Acceptez les cookies.</p></div><footer><p>Tous droits réservés, mentions légales.</p></footer></main>`
 const blocks=extractPublicBlocks(html)
 expect(blocks).toHaveLength(2)
 expect(blocks[1]).toMatchObject({text:input.candidates[1]!.text,advantage:true})
 expect(blocks.map(item=>item.text).join(' ')).not.toMatch(/SECRET|Pourquoi nous choisir|Livraison garantie/)
 const page=extractPage(html+'<a href="/prestations">Prestations</a><a href="/contact">Contact</a><a href="https://autre.test/services">Autre</a><a href="/services?action=delete">Action</a>','https://atelier.example.test/')
 expect(page.activityLinks).toEqual(['https://atelier.example.test/prestations'])
 const simple=extractPublicBlocks('<div><h2>Nos avantages</h2><p>Un interlocuteur dédié à votre projet.</p></div><section><p>Informations générales sur notre atelier.</p></section>')
 expect(simple[0]!.advantage).toBe(true)
 expect(simple[1]!.advantage).toBe(false)
})

it('retains public OSM description and exact service tags for a first recap without copying reviews',()=>{
 const place=mapOsm({type:'node',id:42,tags:{name:'TEST Atelier',shop:'hairdresser',description:'English description','description:fr':'Réparation des sièges anciens.',delivery:'no',wheelchair:'yes',opening_hours:'24/7',reviews:'UNRELATED'}} ,null)!
 expect(place.raw).toMatchObject({description:'Réparation des sièges anciens.',capabilities:{delivery:'no',wheelchair:'yes'},opening_hours:'24/7'})
 expect(JSON.stringify(place.raw)).not.toContain('UNRELATED')
})
