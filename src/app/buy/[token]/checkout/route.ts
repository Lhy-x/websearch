import {NextResponse} from 'next/server'
import {createCheckout} from '@/server/billing/orders'
import {billingSetup,publicBase} from '@/server/billing/stripe'
import {AppError} from '@/server/core/errors'
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}) {
 try {
  const origin=req.headers.get('origin')
  const configured=publicBase(false,(await billingSetup()).base)
  if(req.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(req.url).origin&&origin!==configured))return NextResponse.json({error:'Origine non autorisée'},{status:403})
  return NextResponse.redirect(await createCheckout((await params).token),303)
 }
 catch(e){return NextResponse.json({error:e instanceof AppError?e.message:'Paiement indisponible'},{status:e instanceof AppError?e.status:503})}
}
