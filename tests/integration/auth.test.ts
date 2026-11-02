import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { SESSION_COOKIE, signSession } from '@/lib/session'

describe('route protection (proxy)', () => {
  it('rejects unauthenticated API calls with 401 and redirects pages to /login', async () => {
    const api = await proxy(new NextRequest('http://localhost/api/prospects'))
    expect(api.status).toBe(401)
    const page = await proxy(new NextRequest('http://localhost/campaigns'))
    expect(page.status).toBe(307)
    expect(page.headers.get('location')).toContain('/login?next=%2Fcampaigns')
  })
  it('lets public routes through (previews, unsubscribe, webhooks, login)', async () => {
    for (const p of ['/preview/abc', '/u/token', '/api/webhooks/resend', '/login', '/api/auth/login']) {
      const r = await proxy(new NextRequest(`http://localhost${p}`))
      expect(r.headers.get('x-middleware-next')).toBe('1')
    }
  })
  it('accepts a valid admin session and rejects a forged one', async () => {
    const ok = await proxy(new NextRequest('http://localhost/api/prospects', { headers: { cookie: `${SESSION_COOKIE}=${await signSession('admin@test.local')}` } }))
    expect(ok.headers.get('x-middleware-next')).toBe('1')
    const forged = await proxy(new NextRequest('http://localhost/api/prospects', { headers: { cookie: `${SESSION_COOKIE}=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.bad` } }))
    expect(forged.status).toBe(401)
  })
})
