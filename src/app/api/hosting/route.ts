import { z } from 'zod'
import { adminRoute } from '@/server/http/route'
import { assertSameOrigin } from '@/server/http/origin'
import { getSettings,secretStatus,settingsSchema,updateSettings,setSecret } from '@/server/core/settings'
import { testO2Connection } from '@/server/hosting/o2switch'
import { auditLog } from '@/server/core/audit'
export const GET=adminRoute(async()=>({hosting:(await getSettings()).hosting,secrets:await secretStatus()}))
export const PUT=adminRoute(async({req,body,admin})=>{await assertSameOrigin(req);await updateSettings({hosting:body.hosting});if(body.password)await setSecret('O2SWITCH_FTP_PASSWORD',body.password);if(body.token)await setSecret('O2SWITCH_CPANEL_TOKEN',body.token);await auditLog({action:'hosting.configure',actor:admin.email});return {ok:true}},z.object({hosting:settingsSchema.shape.hosting,password:z.string().max(500).optional(),token:z.string().max(500).optional()}))
export const POST=adminRoute(async({req,admin})=>{await assertSameOrigin(req);const result=await testO2Connection();await auditLog({action:'hosting.connection_test',actor:admin.email});return result})
