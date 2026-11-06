import {expect,it} from 'vitest'
import {checkDesignDiversity,layoutSimilarity} from '@/server/sites/bespoke/diversity'
const css=Array.from({length:24},(_,i)=>`.section${i}{padding:${i+10}px;gap:${i+2}px;color:#123456;display:grid;grid-template-columns:${i+1}fr 2fr}`).join('')
const html=`<html><head><style>${css}</style></head><body><header><h1>Entreprise A</h1></header><main><article><p>Texte</p></article></main></body></html>`
const prior={html,concept:'A',typography:'A',layout:'A',signature:'A',palette:[]}
it('rejects the same structure and CSS with only a new name and palette',()=>{
 expect(checkDesignDiversity(html.replaceAll('#123456','#abcdef').replace('Entreprise A','Entreprise B'),[prior])[0]?.code).toBe('design_duplicate')
})
it('allows genuinely different composition and dimensions',()=>{
 const changed=html.replace('<article>','<section><div>').replace('</article>','</div></section>').replaceAll('display:grid','display:flex').replaceAll('padding:','margin:')
 expect(checkDesignDiversity(changed,[prior])).toEqual([])
})
it('catches renamed CSS classes, new wrappers and small spacing changes',()=>{
 const disguised=html.replaceAll('section','renamed').replace('padding:10px','padding:11px').replace('<main>','<main><div><span>').replace('</main>','</span></div></main>')
 expect(checkDesignDiversity(disguised,[prior])[0]?.code).toBe('design_duplicate')
})
it('uses measured geometry to distinguish a different composition sharing a stylesheet',()=>{
 const base={version:1 as const,hero:[.1,.2,.45,.3,.6,.1,.3,.5,.1,.6,.2,.1],sections:[[.1,.3,.8,.2],[.1,.6,.8,.3]],fonts:['Fraunces','Georgia']}
 const changed={...base,hero:[.05,.02,.9,.2,.1,.6,.8,.3,.4,.8,.2,.1],sections:[[.05,.25,.3,.2],[.4,.3,.55,.2]]}
 expect(checkDesignDiversity(html,[{...prior,fingerprint:base}],{fingerprint:changed})).toEqual([])
 expect(checkDesignDiversity(html,[{...prior,fingerprint:base}],{fingerprint:base})[0]?.code).toBe('design_duplicate')
})
it('does not reward two layouts for sharing absent scene or contact elements',()=>{
 const first={version:1 as const,hero:[0,0,.3,.3,-1,-1,-1,-1,-1,-1,-1,-1],sections:[[0,0,1,1]],fonts:[]}
 const second={...first,hero:[.6,.6,.8,.8,-1,-1,-1,-1,-1,-1,-1,-1]}
 expect(layoutSimilarity(first,second)).toBeLessThan(.5)
})
