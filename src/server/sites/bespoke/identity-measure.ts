import {getBrowser} from '../../enrich/browser'
import {createHash} from 'node:crypto'
import type {DesignFingerprint} from './diversity'

/** Measures CSS layout in Chromium: class renames and color swaps cannot fool it. */
export async function measureIdentity(html:string):Promise<DesignFingerprint>{
 const browser=await getBrowser(),context=await browser.newContext({viewport:{width:1440,height:1000},javaScriptEnabled:false})
 try{
  await context.route('**/*',route=>route.request().url().startsWith('data:')?route.continue():route.abort())
  const page=await context.newPage()
  await page.setContent(html,{waitUntil:'domcontentloaded',timeout:20000})
  const fingerprint=await page.evaluate(`(()=>{
   const width=innerWidth,height=1000,pageHeight=Math.max(document.body.scrollHeight,height)
   const box=(element,scale=height)=>{if(!element)return [-1,-1,-1,-1];const rect=element.getBoundingClientRect();return [rect.x/width,rect.y/scale,rect.width/width,rect.height/scale].map(n=>Math.round(n*1000)/1000)}
   const title=document.querySelector('h1'),scene=document.querySelector('[data-glass-scene]'),cta=document.querySelector('main a[href^="tel:"],main a[href^="mailto:"],a[href^="tel:"],a[href^="mailto:"]')
   const headings=[...document.querySelectorAll('h2')].slice(0,8)
   return {version:1,hero:[...box(title),...box(scene),...box(cta)],sections:headings.map(heading=>box(heading.closest('section,article')||heading.parentElement,pageHeight)),fonts:[title?getComputedStyle(title).fontFamily:'',getComputedStyle(document.body).fontFamily]}
  })()`) as DesignFingerprint
  return {...fingerprint,sourceHash:identityHash(html)}
 }finally{await context.close()}
}
export const identityHash=(html:string)=>createHash('sha256').update('layout-v2\0'+html).digest('hex')
