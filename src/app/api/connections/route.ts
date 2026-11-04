import { z } from 'zod'
import { runtimeValuesSchema } from '@/lib/connection-config'
import { env } from '@/server/core/env'
import { auditLog } from '@/server/core/audit'
import { getRuntimeConfig, getSettings, secretStatus, updateSettings } from '@/server/core/settings'
import { adminRoute } from '@/server/http/route'

export const GET=adminRoute(async()=>{
  const settings=await getSettings()
  const [values,secrets]=await Promise.all([getRuntimeConfig(settings),secretStatus()])
  const e=env()
  return {
    values,secrets,overrides:settings.runtime,maxConcurrentJobs:settings.automation.maxConcurrentJobs,
    sources:Object.fromEntries(Object.keys(values).map(key=>[key,settings.runtime[key as keyof typeof values]===null?'env':'site'])),
    bootstrap:['DATABASE_URL','ADMIN_EMAIL','ADMIN_PASSWORD_HASH','SESSION_SECRET','APP_ENCRYPTION_KEY','STORAGE_DIR'].map(key=>({key,configured:!!e[key as keyof typeof e]})),
  }
})

export const PUT=adminRoute(async({body,admin})=>{
  await updateSettings({runtime:body.values,automation:{maxConcurrentJobs:body.values.WORKER_CONCURRENCY}})
  await auditLog({action:'connections.update',actor:admin.email,data:{keys:Object.keys(body.values)}})
  return {ok:true}
},z.object({values:runtimeValuesSchema}))

export const DELETE=adminRoute(async({admin})=>{
  await updateSettings({runtime:Object.fromEntries(Object.keys(runtimeValuesSchema.shape).map(key=>[key,null])),automation:{maxConcurrentJobs:env().WORKER_CONCURRENCY}})
  await auditLog({action:'connections.inherit',actor:admin.email})
  return {ok:true}
})
