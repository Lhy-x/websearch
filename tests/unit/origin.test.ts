import { describe, expect, it } from 'vitest'
import { assertSameOrigin } from '@/server/http/origin'

const configured = 'https://configured.example.test'
function request(headers: Record<string, string>, url = 'http://127.0.0.1:3000/api/connections/resend-webhook') {
  return new Request(url, { method: 'POST', headers })
}
describe('browser-facing request origins', () => {
  it('accepts localhost when Next uses 127.0.0.1 and the public URL is configured separately', async () => {
    await expect(assertSameOrigin(request({host:'localhost:3000',origin:'http://localhost:3000','sec-fetch-site':'same-origin'}),configured)).resolves.toBeUndefined()
  })
  it('supports IPv6 and default-port normalization without treating every local port as trusted', async () => {
    await expect(assertSameOrigin(request({host:'[::1]:3000',origin:'http://[::1]:3000'}),configured)).resolves.toBeUndefined()
    await expect(assertSameOrigin(request({host:'LOCALHOST:80',origin:'http://localhost'}),configured)).resolves.toBeUndefined()
    await expect(assertSameOrigin(request({host:'localhost:3000',origin:'http://localhost:3001'}),configured)).rejects.toMatchObject({status:403})
  })
  it('supports HTTPS termination with the original Host and forwarded protocol', async () => {
    await expect(assertSameOrigin(request({host:'dashboard.example.test',origin:'https://dashboard.example.test','x-forwarded-proto':'https'}),configured)).resolves.toBeUndefined()
  })
  it('supports a proxy-rewritten Host only with same-origin Fetch Metadata for its forwarded authority', async () => {
    const headers={host:'internal:3000',origin:'https://tunnel.example.test','x-forwarded-host':'tunnel.example.test','x-forwarded-proto':'https'}
    await expect(assertSameOrigin(request({...headers,'sec-fetch-site':'same-origin'}),configured)).resolves.toBeUndefined()
    await expect(assertSameOrigin(request(headers),configured)).rejects.toMatchObject({status:403})
  })
  it('accepts the explicitly configured public origin and authenticated clients without an Origin', async () => {
    await expect(assertSameOrigin(request({origin:configured}),configured)).resolves.toBeUndefined()
    await expect(assertSameOrigin(request({}),configured)).resolves.toBeUndefined()
  })
  it.each(['https://foreign.example.test','null','https://configured.example.test.evil.test','https://user:pass@configured.example.test','https://configured.example.test/path','https://configured.example.test?token=x'])('refuses a foreign or malformed Origin: %s',async(origin)=>{
    await expect(assertSameOrigin(request({host:'localhost:3000',origin}),configured)).rejects.toMatchObject({status:403,code:'ORIGIN_NOT_ALLOWED'})
  })
  it.each(['cross-site','same-site'])('refuses browser requests marked %s, even with a configured Origin or forwarded headers',async(site)=>{
    await expect(assertSameOrigin(request({origin:configured,host:'localhost:3000','x-forwarded-host':'configured.example.test','x-forwarded-proto':'https','sec-fetch-site':site}),configured)).rejects.toMatchObject({status:403})
    await expect(assertSameOrigin(request({'sec-fetch-site':site}),configured)).rejects.toMatchObject({status:403})
  })
  it('does not trust a forged forwarded host, a header list or a different scheme/port',async()=>{
    await expect(assertSameOrigin(request({host:'localhost:3000',origin:'https://foreign.example.test','x-forwarded-host':'foreign.example.test','x-forwarded-proto':'https'}),configured)).rejects.toMatchObject({status:403})
    await expect(assertSameOrigin(request({host:'localhost:3000,foreign.example.test',origin:'http://foreign.example.test'}),configured)).rejects.toMatchObject({status:403})
    await expect(assertSameOrigin(request({host:'localhost:3000',origin:'https://localhost:3000'}),configured)).rejects.toMatchObject({status:403})
  })
})
