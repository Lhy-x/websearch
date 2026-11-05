// Node preload for browser tests only. Emulates webhook management without contacting Resend.
const originalFetch = globalThis.fetch
const hooks = new Map()
const secret = 'whsec_' + Buffer.from('resend-browser-fixture-signing-key-only').toString('base64')
const subscriptions = new Map()
let paymentAttempts = 0
globalThis.fetch = async function(input, init = {}) {
  const raw = input instanceof Request ? input.url : String(input)
  if(raw.startsWith('https://api.stripe.com/')){
    const path = new URL(raw).pathname, method = init.method || 'GET'
    const authorization = new Headers(init.headers).get('authorization') || ''
    if(authorization.includes('sk_test_e2e_checkout_only')&&path==='/v1/checkout/sessions'&&method==='POST'){
      const form=new URLSearchParams(String(init.body))
      if(form.get('invoice_creation[enabled]')!=='true'||form.get('line_items[0][price_data][unit_amount]')!=='19900')return Response.json({error:{type:'invalid_request_error',message:'Invoice and fixed price required in fixture'}},{status:400})
      paymentAttempts++
      if(paymentAttempts===1)return Response.json({error:{type:'invalid_request_error',message:'Your business name must be set before accepting payments. sk_test_hidden_in_error buyer@example.test https://localhost/purchase/private-fixture-token',param:'business_profile[name]'}},{status:400,headers:{'request-id':'req_checkoutfailurefixture'}})
      return Response.json({id:'cs_checkout_recovered_fixture',url:'https://checkout.stripe.com/c/offline-checkout-fixture'})
    }
    if(!authorization.includes('sk_test_e2e_host_only'))return Response.json({error:{message:'Offline fixture key required'}},{status:401})
    if(path==='/v1/checkout/sessions'&&method==='POST'){
      const form=new URLSearchParams(String(init.body))
      const id='sub_fixture_'+(subscriptions.size+1)
      subscriptions.set(id,{id,object:'subscription',status:'active',customer:'cus_fixture_host',cancel_at_period_end:false,metadata:{hosting_order_id:form.get('subscription_data[metadata][hosting_order_id]'),hosting_attempt:form.get('subscription_data[metadata][hosting_attempt]')},latest_invoice:{id:'in_fixture_host',status:'paid'},items:{data:[{quantity:1,current_period_end:Math.floor(Date.now()/1000)+86400,price:{currency:form.get('line_items[0][price_data][currency]'),unit_amount:Number(form.get('line_items[0][price_data][unit_amount]')),recurring:{interval:'month',interval_count:1}}}]}})
      return Response.json({id:'cs_fixture_host_'+subscriptions.size,object:'checkout.session',url:'https://checkout.stripe.com/c/offline-host-fixture'})
    }
    if(path.startsWith('/v1/subscriptions/')){
      const item=subscriptions.get(path.split('/').pop())
      return item?Response.json(item):Response.json({error:{message:'Fixture not found'}},{status:404})
    }
    if(path.startsWith('/v1/checkout/sessions/'))return Response.json({id:path.split('/').pop(),status:'open',url:'https://checkout.stripe.com/c/offline-host-fixture'})
    if(path==='/v1/billing_portal/sessions')return Response.json({id:'bps_fixture',url:'https://billing.stripe.com/p/offline-host-fixture'})
    return Response.json({error:{message:'Unsupported offline endpoint'}},{status:400})
  }
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
