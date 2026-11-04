import { beforeEach, afterEach, afterAll, expect, it, vi } from 'vitest'
import { mkdtemp, chmod, copyFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Stripe from 'stripe'
import { resetDb } from './helpers'
import { closeDb, sql } from '@/server/core/db'
import { getSecret, setSecret } from '@/server/core/settings'
import { StripeTestListener, stripeForwardTarget } from '@/server/billing/test-listener'
import { verifiedStripeEvent } from '@/server/billing/orders'

const secret = 'whsec_0123456789abcdefghijklmnopqrstuvwxyzTESTONLY'
const key = 'sk_test_fixture_listener_only'
const target = 'http://127.0.0.1:3999/api/webhooks/stripe'
let directory = '', binary = '', capture = ''
const managers: StripeTestListener[] = []
function manager(timeoutMs = 3000, available = true) {
  const instance = new StripeTestListener({ binary: async () => available ? binary : null, timeoutMs })
  managers.push(instance)
  return instance
}
beforeEach(async () => {
  await resetDb()
  directory = await mkdtemp(path.join(tmpdir(), 'pf-stripe-listener-'))
  binary = path.join(directory, 'stripe')
  capture = path.join(directory, 'calls.jsonl')
  await copyFile('tests/fixtures/stripe-cli.cjs', binary); await chmod(binary, 0o700)
  vi.stubEnv('PF_STRIPE_FIXTURE_CAPTURE', capture)
  vi.stubEnv('PF_STRIPE_FIXTURE_MODE', 'ready')
})
afterEach(async () => {
  for (const instance of managers.splice(0)) await instance.stop()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
afterAll(closeDb)

it('starts only once, captures a chunked secret privately, verifies signed webhooks and stops its own process', async () => {
  await setSecret('STRIPE_SECRET_KEY','sk_live_preserved_fixture'); await setSecret('STRIPE_WEBHOOK_SECRET','whsec_preserved_fixture')
  const instance = manager()
  const [first, second] = await Promise.all([instance.start(key, target), instance.start(key, target)])
  expect(first).toMatchObject({state:'running',secretSaved:true,forwardTo:target})
  expect(second.startedAt).toBe(first.startedAt)
  expect(await getSecret('STRIPE_TEST_WEBHOOK_SECRET')).toBe(secret)
  expect(await getSecret('STRIPE_TEST_SECRET_KEY')).toBe(key)
  expect(await getSecret('STRIPE_SECRET_KEY')).toBe('sk_live_preserved_fixture')
  expect(await getSecret('STRIPE_WEBHOOK_SECRET')).toBe('whsec_preserved_fixture')
  const [row] = await sql()`select secrets from admin_settings where id=1`
  expect(row!.secrets.STRIPE_TEST_WEBHOOK_SECRET).toMatch(/^v1:/)
  expect(JSON.stringify(row)).not.toContain(secret)
  expect(JSON.stringify(await instance.status())).not.toMatch(/whsec_|sk_test_/)
  const calls = (await readFile(capture,'utf8')).trim().split('\n').map(line=>JSON.parse(line))
  expect(calls).toHaveLength(1)
  expect(calls[0].keyPresent).toBe(true)
  expect(calls[0].deviceName).toBe('ProspectForge')
  expect(calls[0].args).toContain('--forward-to'); expect(calls[0].args).not.toContain('--live')
  expect(JSON.stringify(calls[0].args)).not.toContain(key)
  const payload=JSON.stringify({id:'evt_listener_fixture',object:'event',type:'invoice.finalized',livemode:false,data:{object:{}}})
  expect((await verifiedStripeEvent(payload,Stripe.webhooks.generateTestHeaderString({payload,secret}))).id).toBe('evt_listener_fixture')
  expect((await instance.stop()).state).toBe('stopped')
  expect(()=>process.kill(calls[0].pid,0)).toThrow()
  expect((await instance.stop()).state).toBe('stopped')
  expect(await getSecret('STRIPE_TEST_WEBHOOK_SECRET')).toBe(secret)
})

it('refuses real keys and nonlocal forwarding before changing any secret',async()=>{
  await setSecret('STRIPE_TEST_WEBHOOK_SECRET','whsec_existing_test_only')
  const instance=manager()
  await expect(instance.start('sk_live_fixture_only',target)).rejects.toThrow('clés réelles')
  await expect(instance.start(key,'https://example.test/api/webhooks/stripe')).rejects.toThrow('webhook local')
  expect(await getSecret('STRIPE_TEST_WEBHOOK_SECRET')).toBe('whsec_existing_test_only')
  expect((await instance.status()).state).toBe('stopped')
})

it('explains the missing CLI without modifying the stored webhook',async()=>{
  const instance=manager(3000,false)
  await expect(instance.start(key,target)).rejects.toThrow('brew install stripe/stripe-cli/stripe')
  expect(await getSecret('STRIPE_TEST_WEBHOOK_SECRET')).toBe('')
  expect((await instance.status()).cliAvailable).toBe(false)
})

it('redacts an authentication failure even when the CLI prints the API key',async()=>{
  vi.stubEnv('PF_STRIPE_FIXTURE_MODE','reject')
  const instance=manager()
  await expect(instance.start(key,target)).rejects.toThrow('refusée')
  const status=await instance.status()
  expect(status.state).toBe('error');expect(JSON.stringify(status)).not.toContain(key)
  expect(await getSecret('STRIPE_TEST_WEBHOOK_SECRET')).toBe('')
})

it('times out an unresponsive listener and terminates it',async()=>{
  vi.stubEnv('PF_STRIPE_FIXTURE_MODE','hang')
  const instance=manager(600)
  await expect(instance.start(key,target)).rejects.toThrow('Stripe ne répond pas')
  await instance.stop()
  const call=JSON.parse((await readFile(capture,'utf8')).trim())
  expect(()=>process.kill(call.pid,0)).toThrow()
  expect(await getSecret('STRIPE_TEST_WEBHOOK_SECRET')).toBe('')
})

it('reports an unexpected exit and can be started again',async()=>{
  vi.stubEnv('PF_STRIPE_FIXTURE_MODE','exit')
  const instance=manager()
  await instance.start(key,target)
  await expect.poll(async()=>(await instance.status()).state).toBe('error')
  vi.stubEnv('PF_STRIPE_FIXTURE_MODE','ready')
  expect((await instance.start(key,target)).state).toBe('running')
  await expect(instance.start('sk_test_different_fixture',target)).rejects.toThrow('Arrêtez le relais')
})

it('forwards to the actual local application port and ignores external hostnames',()=>{
  vi.stubEnv('PORT','')
  expect(stripeForwardTarget('http://localhost:3107/api/billing/test-listener')).toBe('http://127.0.0.1:3107/api/webhooks/stripe')
  expect(stripeForwardTarget('https://remote.example.test/api/billing/test-listener')).toBe('http://127.0.0.1:3000/api/webhooks/stripe')
  vi.stubEnv('PORT','3222')
  expect(stripeForwardTarget('https://remote.example.test/api/billing/test-listener')).toBe('http://127.0.0.1:3222/api/webhooks/stripe')
})
