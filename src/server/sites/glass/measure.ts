import { getBrowser } from '../../enrich/browser'
import type { QualityIssue } from '@/lib/site/bespoke-schema'

/** Validate the actual trusted WebGL scene, not just an empty HTML placeholder. */
export async function measurePersonalizedScene(html: string): Promise<QualityIssue[]> {
  const browser=await getBrowser({softwareWebGL:true})
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'})
  try {
    const page=await context.newPage()
    await page.setContent(html,{waitUntil:'domcontentloaded',timeout:20000})
    await page.waitForFunction(()=>!!document.documentElement.dataset.glassState,undefined,{timeout:20000})
    const result=await page.evaluate(()=>({ready:document.documentElement.dataset.glassState==='ready',height:document.querySelector('[data-glass-scene]')?.getBoundingClientRect().height??0,pieces:(window as unknown as {__personalizedGlass?:{pieces:number}}).__personalizedGlass?.pieces??0}))
    if(!result.ready||result.pieces!==4)return [{code:'glass_runtime',severity:'critical',message:'La silhouette ne produit pas quatre fragments 3D valides dans Chromium. Simplifie le contour SVG, supprime les trous et les chevauchements.'}]
    if(result.height<250)return [{code:'glass_size',severity:'major',message:'La scène 3D est trop petite sur mobile. Prévois au moins 280 px de hauteur.'}]
    return []
  } catch {return [{code:'glass_runtime',severity:'critical',message:'Le rendu WebGL ne s’initialise pas. Simplifie la silhouette SVG et conserve exactement un emplacement data-glass-scene.'}]}
  finally {await context.close()}
}
