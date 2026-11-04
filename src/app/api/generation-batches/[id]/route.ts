import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { generationBatch,changeGenerationBatch } from '@/server/sites/batches'
export const GET=adminRoute(async({params,req})=>generationBatch(z.string().uuid().parse(params.id),Math.max(1,Number(new URL(req.url).searchParams.get('page'))||1)))
export const POST=adminRoute(async({params,body})=>changeGenerationBatch(z.string().uuid().parse(params.id),body.action,body.jobId),z.object({action:z.enum(['retry','cancel_pending']),jobId:z.string().uuid().optional()}))
