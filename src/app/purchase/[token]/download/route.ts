import {purchaseConfig} from '@/server/billing/orders'
import {exportSiteZip} from '@/server/sites/export'
import {AppError} from '@/server/core/errors'
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}) {
 try{const z=await exportSiteZip(await purchaseConfig((await params).token));return new Response(new Uint8Array(z.buffer),{headers:{'content-type':'application/zip','content-disposition':`attachment; filename="${z.filename}"`,'cache-control':'private, no-store','referrer-policy':'no-referrer'}})}
 catch(e){return new Response(e instanceof AppError?e.message:'Téléchargement indisponible',{status:e instanceof AppError?e.status:500})}
}
