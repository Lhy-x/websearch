import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { assertSameOrigin } from '@/server/http/origin'
import { auditLog } from '@/server/core/audit'
import { launchReadiness,setLaunchMode } from '@/server/core/launch'
export const GET=adminRoute(async()=>launchReadiness())
export const POST=adminRoute(async({req,body,admin})=>{await assertSameOrigin(req);const result=await setLaunchMode(body.mode);await auditLog({action:'launch.mode',actor:admin.email,data:{mode:body.mode}});return result},z.object({mode:z.enum(['test','live'])}))
