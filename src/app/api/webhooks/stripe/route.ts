import {NextResponse} from 'next/server'
import {processStripeEvent,verifiedStripeEvent} from '@/server/billing/orders'
import {AppError} from '@/server/core/errors'
export async function POST(req:Request) {
 const raw=await req.text()
 if(raw.length>1000000)return NextResponse.json({error:'Événement trop volumineux'},{status:413})
 try {const event=await verifiedStripeEvent(raw,req.headers.get('stripe-signature')??'');return NextResponse.json(await processStripeEvent(event))}
 catch(e){return NextResponse.json({error:e instanceof AppError?e.message:'Événement non traité, réessayez'},{status:e instanceof AppError?e.status:500})}
}
