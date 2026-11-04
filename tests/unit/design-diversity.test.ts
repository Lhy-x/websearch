import {expect,it} from 'vitest'
import {checkDesignDiversity} from '@/server/sites/bespoke/diversity'
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
