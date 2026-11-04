import { beforeEach, afterAll, it, expect, vi } from 'vitest'
import { resetDb, insertTestBusiness } from './helpers'
import { closeDb, sql } from '@/server/core/db'
import { resetEnvCache } from '@/server/core/env'
import { getRuntimeConfig, getPreviewBaseUrl, getSecret, inheritSecret, SECRET_KEYS, secretStatus, setSecret, updateSettings } from '@/server/core/settings'
import { SECRET_GUIDES } from '@/lib/connection-config'
import { unsubscribeUrl } from '@/server/email/compose'
import { getEmailProvider } from '@/server/email/providers'
import { POST as inbound } from '@/app/api/webhooks/inbound/route'
import nodemailer from 'nodemailer'

beforeEach(async()=>{await resetDb();vi.stubEnv('OPENAI_API_KEY','test-environment-key-only');vi.stubEnv('INBOUND_WEBHOOK_SECRET','test-environment-webhook-only');resetEnvCache()})
afterAll(async()=>{vi.unstubAllEnvs();resetEnvCache();await closeDb()})
it('encrypts site overrides, explicitly disables an environment key and can inherit it again',async()=>{
 expect(await getSecret('OPENAI_API_KEY')).toBe('test-environment-key-only')
 await setSecret('OPENAI_API_KEY','test-site-key-only')
 expect(await getSecret('OPENAI_API_KEY')).toBe('test-site-key-only');expect((await secretStatus()).OPENAI_API_KEY).toBe('db')
 const [saved]=await sql()`select secrets from admin_settings where id=1`
 expect(saved!.secrets.OPENAI_API_KEY).toMatch(/^v1:/);expect(JSON.stringify(saved)).not.toContain('test-site-key-only')
 await setSecret('OPENAI_API_KEY',null);expect(await getSecret('OPENAI_API_KEY')).toBe('');expect((await secretStatus()).OPENAI_API_KEY).toBe('missing')
 await inheritSecret('OPENAI_API_KEY');expect(await getSecret('OPENAI_API_KEY')).toBe('test-environment-key-only')
})
it('uses saved SMTP values and public URLs without changing process.env',async()=>{
 await updateSettings({launch:{mode:'live'}},{allowModeChange:true})
 await updateSettings({runtime:{APP_BASE_URL:'https://atelier.example.test',EMAIL_PROVIDER:'smtp',SMTP_HOST:'smtp.example.test',SMTP_PORT:465,SMTP_USER:'fixture@example.test',SMTP_SECURE:true}})
 await setSecret('SMTP_PASSWORD','test-smtp-password-only')
 const spy=vi.spyOn(nodemailer,'createTransport').mockReturnValue({} as ReturnType<typeof nodemailer.createTransport>)
 try{expect((await getEmailProvider()).id).toBe('smtp');expect(spy).toHaveBeenCalledWith(expect.objectContaining({host:'smtp.example.test',port:465,secure:true,auth:{user:'fixture@example.test',pass:'test-smtp-password-only'}}))}finally{spy.mockRestore()}
 expect(process.env.EMAIL_PROVIDER).toBe('sandbox');expect((await getRuntimeConfig()).EMAIL_PROVIDER).toBe('smtp')
 expect(await getPreviewBaseUrl()).toBe('https://atelier.example.test');expect(await unsubscribeUrl('private-token')).toBe('https://atelier.example.test/u/private-token')
 await updateSettings({runtime:{EMAIL_PROVIDER:null}});expect((await getRuntimeConfig()).EMAIL_PROVIDER).toBe('sandbox')
 await expect(updateSettings({runtime:{SMTP_PORT:0}})).rejects.toThrow();expect((await getRuntimeConfig()).SMTP_PORT).toBe(465)
})
it('authenticates inbound webhooks with the encrypted site secret and stops accepting it after disabling',async()=>{
 await insertTestBusiness({email:'reply@example.test'})
 await setSecret('INBOUND_WEBHOOK_SECRET','test-site-webhook-only')
 const request=(secret:string)=>new Request('http://localhost/api/webhooks/inbound',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({from:'reply@example.test',subject:'Merci',text:'Merci pour votre proposition.',messageId:'<test-connections@example.test>'})})
 expect((await inbound(request('test-environment-webhook-only'))).status).toBe(401)
 expect((await inbound(request('test-site-webhook-only'))).status).toBe(200)
 await setSecret('INBOUND_WEBHOOK_SECRET',null)
 expect((await inbound(request('test-site-webhook-only'))).status).toBe(503)
})
it('provides an in-app guide for every supported service secret',()=>{
 expect(new Set(SECRET_GUIDES.map(guide=>guide.key))).toEqual(new Set(SECRET_KEYS))
 expect(SECRET_GUIDES.every(guide=>guide.steps.length>=3)).toBe(true)
})
