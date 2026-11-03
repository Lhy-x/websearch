import { afterAll, beforeEach, expect, it } from 'vitest'
import { POST } from '@/app/api/auth/login/route'
import { closeDb } from '@/server/core/db'
import { resetDb } from './helpers'
import { resetEnvCache } from '@/server/core/env'
import { hashPassword } from '@/server/core/crypto'

beforeEach(async()=>{await resetDb();process.env.ADMIN_EMAIL='admin@test.local';process.env.ADMIN_PASSWORD_HASH=await hashPassword('TEST-password-123');resetEnvCache()})
afterAll(closeDb)
const form=(values:Record<string,string>,origin='http://localhost:3999')=>new Request('http://localhost:3999/api/auth/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin},body:new URLSearchParams(values)})

it('supports JSON clients as before',async()=>{
 const r=await POST(new Request('http://localhost:3999/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@test.local',password:'TEST-password-123'})}))
 expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});expect(r.headers.get('set-cookie')).toContain('HttpOnly')
})
it('logs in with a native POST before hydration and redirects without credentials',async()=>{
 const r=await POST(form({email:'admin@test.local',password:'TEST-password-123',next:'/generator'}))
 expect(r.status).toBe(303);expect(r.headers.get('location')).toBe('http://localhost:3999/generator');expect(r.headers.get('set-cookie')).toContain('HttpOnly')
})
it('never puts invalid credentials in a redirect URL and blocks foreign origins',async()=>{
 const r=await POST(form({email:'admin@test.local',password:'TEST-wrong-password'}))
 expect(r.status).toBe(303);expect(r.headers.get('location')).toBe('http://localhost:3999/login?error=credentials')
 expect((await POST(form({email:'admin@test.local',password:'TEST-password-123'},'https://foreign.test'))).status).toBe(403)
})
it('rejects protocol-relative and backslash return paths',async()=>{
 for(const next of ['//foreign.test','/\\foreign.test']) {
  const r=await POST(form({email:'admin@test.local',password:'TEST-password-123',next}))
  expect(r.headers.get('location')).toBe('http://localhost:3999/')
 }
})
