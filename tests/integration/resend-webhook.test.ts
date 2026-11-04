import { beforeEach, afterEach, afterAll, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { resetDb } from './helpers'
import { closeDb, sql } from '@/server/core/db'
import { getRuntimeConfig, getSecret, setSecret } from '@/server/core/settings'
import { createResendWebhook, resendWebhookStatus, resendWebhookEndpoint, setResendWebhookEnabled } from '@/server/email/resend-webhook'
import { POST as receive } from '@/app/api/webhooks/resend/route'

const key = 're_fixture_full_access_only'
const secret = 'whsec_' + Buffer.from('test-resend-signature-key-only-32bytes').toString('base64')
const base = 'https://resend-fixture.example.test'
type Remote = { id: string; endpoint: string; events: string[]; status: string; signing_secret: string }
let remote: Map<string, Remote>
let requests: { method: string; url: string; body?: Record<string, unknown> }[]
let failure = 0, omitSecret = false
beforeEach(async () => {
  await resetDb(); remote = new Map(); requests = []; failure = 0; omitSecret = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    expect(url.startsWith('https://api.resend.com/webhooks')).toBe(true)
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${key}` })
    const method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({method,url,body})
    if (failure) return Response.json({message:key+' '+secret},{status:failure})
    const path = new URL(url).pathname
    if (path === '/webhooks' && method === 'GET') return Response.json({object:'list',has_more:false,data:[...remote.values()]})
    if (path === '/webhooks' && method === 'POST') {
      const id='fixture-webhook-'+(remote.size+1)
      remote.set(id,{id,endpoint:body.endpoint,events:body.events,status:'enabled',signing_secret:secret})
      return Response.json({object:'webhook',id,...(omitSecret?{}:{signing_secret:secret})})
    }
    const item=remote.get(path.split('/').pop()!)
    if (!item) return Response.json({message:'not found'},{status:404})
    if (method==='PATCH') Object.assign(item,body)
    return Response.json(item)
  }))
})
afterEach(() => vi.unstubAllGlobals())
afterAll(closeDb)

it('creates a remote webhook, encrypts both keys and verifies a signed callback without sending email',async()=>{
  const result=await createResendWebhook(base,key)
  expect(result.webhook).toMatchObject({endpoint:base+'/api/webhooks/resend',status:'enabled'})
  expect(result.keyConfigured&&result.secretConfigured).toBe(true)
  expect(JSON.stringify(result)).not.toContain(secret);expect(JSON.stringify(result)).not.toContain(key)
  expect(await getSecret('RESEND_API_KEY')).toBe(key);expect(await getSecret('RESEND_WEBHOOK_SECRET')).toBe(secret)
  const [saved]=await sql()`select secrets from admin_settings where id=1`
  expect(saved!.secrets.RESEND_WEBHOOK_SECRET).toMatch(/^v1:/);expect(JSON.stringify(saved)).not.toContain(secret)
  expect((await getRuntimeConfig()).EMAIL_PROVIDER).toBe('sandbox')
  const body=JSON.stringify({type:'email.delivered',data:{email_id:'unknown-test-email'}})
  const ts=String(Math.floor(Date.now()/1000)),id='evt_resend_configured_test'
  const signature=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${id}.${ts}.${body}`).digest('base64')
  const req=(sig:string)=>new Request('http://localhost/api/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':ts,'svix-signature':sig},body})
  expect((await receive(req('v1,'+signature))).status).toBe(200)
  expect((await receive(req('v1,invalid'))).status).toBe(401)
  expect(requests.some(request=>request.url.includes('/emails'))).toBe(false)
})

it('reuses an existing endpoint and preserves additional configured events',async()=>{
  remote.set('existing',{id:'existing',endpoint:base+'/api/webhooks/resend',events:['email.opened'],status:'disabled',signing_secret:secret})
  await createResendWebhook(base,key)
  expect(remote.size).toBe(1);expect(requests.filter(request=>request.method==='POST')).toHaveLength(0)
  expect(remote.get('existing')).toMatchObject({status:'enabled',events:expect.arrayContaining(['email.opened','email.delivered','email.complained'])})
  await createResendWebhook(base)
  expect(requests.filter(request=>request.method==='POST')).toHaveLength(0)
})

it('does not create duplicate endpoints when two requests arrive together',async()=>{
  const result=await Promise.allSettled([createResendWebhook(base,key),createResendWebhook(base,key)])
  expect(result.some(item=>item.status==='fulfilled')).toBe(true)
  expect(remote.size).toBe(1);expect(requests.filter(request=>request.method==='POST')).toHaveLength(1)
})

it('can disable and enable its configured webhook without deleting either key',async()=>{
  await createResendWebhook(base,key)
  expect((await setResendWebhookEnabled(false)).webhook?.status).toBe('disabled')
  expect([...remote.values()][0]!.status).toBe('disabled')
  expect((await setResendWebhookEnabled(true)).webhook?.status).toBe('enabled')
  expect(await getSecret('RESEND_WEBHOOK_SECRET')).toBe(secret)
  await setSecret('RESEND_API_KEY','re_changed_account_only')
  await expect(setResendWebhookEnabled(false)).rejects.toThrow('La clé Resend a changé')
})

it('keeps existing credentials and redacts a permissions error from the provider',async()=>{
  await setSecret('RESEND_API_KEY','re_previous_fixture_only');await setSecret('RESEND_WEBHOOK_SECRET','whsec_previous_fixture_only')
  failure=403
  await expect(createResendWebhook(base,key)).rejects.toThrow('Full access')
  expect(await getSecret('RESEND_API_KEY')).toBe('re_previous_fixture_only')
  expect(await getSecret('RESEND_WEBHOOK_SECRET')).toBe('whsec_previous_fixture_only')
  expect((await resendWebhookStatus()).webhook).toBeNull()
})

it('recovers a remotely created webhook after an incomplete response without creating another',async()=>{
  omitSecret=true
  await expect(createResendWebhook(base,key)).rejects.toThrow('secret attendu')
  expect(await getSecret('RESEND_WEBHOOK_SECRET')).toBe('')
  omitSecret=false
  expect((await createResendWebhook(base,key)).secretConfigured).toBe(true)
  expect(remote.size).toBe(1);expect(requests.filter(request=>request.method==='POST')).toHaveLength(1)
})

it.each(['http://localhost:3000','https://localhost','https://127.0.0.1','https://192.168.1.2','https://[::1]','https://private.local','https://user:pass@example.test','https://example.test/other','https://example.test?token=test'])('rejects nonpublic or ambiguous endpoints before contacting Resend: %s',async(url)=>{
  await expect(createResendWebhook(url,key)).rejects.toThrow('HTTPS publique')
  expect(requests).toHaveLength(0)
})

it('accepts an origin or the exact callback URL, and reports rate limits safely',async()=>{
  expect(resendWebhookEndpoint(base+'/api/webhooks/resend')).toBe(base+'/api/webhooks/resend')
  failure=429
  await expect(createResendWebhook(base,key)).rejects.toThrow('limite les requêtes')
  expect(await getSecret('RESEND_WEBHOOK_SECRET')).toBe('')
})

it('retries a temporary rate limit before creating the webhook',async()=>{
  const fetchMock=vi.mocked(fetch)
  fetchMock.mockImplementationOnce(async()=>Response.json({message:'rate limited'},{status:429,headers:{'retry-after':'1'}}))
  expect((await createResendWebhook(base,key)).secretConfigured).toBe(true)
  expect(remote.size).toBe(1)
})
