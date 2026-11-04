// Node preload for browser tests only. Emulates webhook management without contacting Resend.
const originalFetch = globalThis.fetch
const hooks = new Map()
const secret = 'whsec_' + Buffer.from('resend-browser-fixture-signing-key-only').toString('base64')
globalThis.fetch = async function(input, init = {}) {
  const raw = input instanceof Request ? input.url : String(input)
  if (!raw.startsWith('https://api.resend.com/')) return originalFetch(input, init)
  const key = new Headers(init.headers).get('authorization')
  if (key !== 'Bearer re_e2e_full_access_only') return Response.json({message:'Full access required'},{status:403})
  const path = new URL(raw).pathname, method = init.method || 'GET'
  const body = init.body ? JSON.parse(String(init.body)) : {}
  if (path === '/webhooks' && method === 'GET') return Response.json({object:'list',has_more:false,data:[...hooks.values()]})
  if (path === '/webhooks' && method === 'POST') {
    const id = 'e2e-webhook-'+(hooks.size+1)
    hooks.set(id,{object:'webhook',id,endpoint:body.endpoint,events:body.events,status:'enabled',signing_secret:secret})
    return Response.json({object:'webhook',id,signing_secret:secret})
  }
  const item = hooks.get(path.split('/').pop())
  if (!item) return Response.json({message:'Not found'},{status:404})
  if (method === 'PATCH') Object.assign(item,body)
  return Response.json(item)
}
