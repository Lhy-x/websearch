import { purchaseConfig } from '@/server/billing/orders'
import { renderVersion } from '@/server/sites/render-any'
import { SITE_CSS } from '@/lib/site/render/site-css'
import { AppError } from '@/server/core/errors'
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){try{const document=await renderVersion(await purchaseConfig((await params).token),'export');return new Response(document.replace(/<link[^>]+href="site\.css"[^>]*>/i,`<style>${SITE_CSS}</style>`),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','content-security-policy':"sandbox allow-scripts allow-popups allow-top-navigation-by-user-activation",'x-robots-tag':'noindex'}})}catch(error){return new Response(error instanceof AppError?error.message:'Aperçu indisponible',{status:error instanceof AppError?error.status:502})}}
