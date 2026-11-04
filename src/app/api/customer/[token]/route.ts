import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AppError } from '@/server/core/errors'
import { assertSameOrigin } from '@/server/http/origin'
import { customerDashboard,createHostingCheckout,hostingPortal,requestPublication,saveCustomerDomain,verifyCustomerDomain } from '@/server/hosting/service'
type Context={params:Promise<{token:string}>}
const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex'}
function failure(error:unknown){return NextResponse.json({error:error instanceof AppError?error.message:'Cette action est temporairement indisponible. Réessayez ou contactez le vendeur.'},{status:error instanceof AppError?error.status:error instanceof z.ZodError?400:502,headers})}
export async function GET(_req:Request,ctx:Context){try{return NextResponse.json(await customerDashboard((await ctx.params).token),{headers})}catch(error){return failure(error)}}
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('subscribe')}),z.object({action:z.literal('portal')}),z.object({action:z.literal('publish')}),z.object({action:z.literal('domain'),domain:z.string().max(253)}),z.object({action:z.literal('verify_domain')})])
export async function POST(req:Request,ctx:Context){try{await assertSameOrigin(req);const token=(await ctx.params).token,body=schema.parse(await req.json());const result=body.action==='subscribe'?await createHostingCheckout(token):body.action==='portal'?await hostingPortal(token):body.action==='publish'?await requestPublication(token):body.action==='domain'?await saveCustomerDomain(token,body.domain):await verifyCustomerDomain(token);return NextResponse.json(result,{headers})}catch(error){return failure(error)}}
