import test from 'node:test'
import assert from 'node:assert/strict'
import callback from '../api/payments/mpesa-callback.js'
import start from '../api/payments/start.js'
import expire from '../api/cron/expire-subscriptions.js'

const uid='11111111-1111-4111-8111-111111111111'
function response(){return {statusCode:200,body:null,status(code){this.statusCode=code;return this},json(value){this.body=value;return this}}}
async function scenario(run, handler) {
  const oldFetch=globalThis.fetch
  const oldEnv={...process.env}
  Object.assign(process.env,{SUPABASE_URL:'https://qa.supabase.invalid',SUPABASE_SERVICE_ROLE_KEY:'qa-service-key',PAYMENTS_MODE:'live',MPESA_CONSUMER_KEY:'qa-key',MPESA_CONSUMER_SECRET:'qa-secret',MPESA_BUSINESS_SHORT_CODE:'123',MPESA_PASSKEY:'qa-pass',MPESA_CALLBACK_URL:'https://qa.invalid/callback',PREMIUM_PRICE_KES:'500',CRON_SECRET:'qa-cron'})
  const calls=[]
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url),method=options.method||'GET'
    calls.push({url:url.pathname,method,body:options.body})
    const result=await run(url,options)
    if(result instanceof Response)return result
    return Response.json(result)
  }
  try {await handler(calls)}finally {globalThis.fetch=oldFetch;process.env=oldEnv}
}
const request={method:'POST',body:{Body:{stkCallback:{CheckoutRequestID:'checkout',MerchantRequestID:'merchant',ResultCode:0,CallbackMetadata:{Item:[{Name:'MpesaReceiptNumber',Value:'receipt'}]}}}}}
const payment={id:'payment',provider_ref:'merchant',raw:{merchantRequestId:'merchant'}}

for(const code of [0,1032]) test('M-Pesa uses verified provider outcome '+code,async()=>scenario(async(url,options)=>{
  if(url.pathname==='/rest/v1/payments')return options.method==='PATCH'?new Response(null,{status:204}):[payment]
  if(url.pathname==='/oauth/v1/generate')return {access_token:'qa-provider-token'}
  if(url.pathname==='/mpesa/stkpushquery/v1/query')return {ResultCode:code,CheckoutRequestID:'checkout',MerchantRequestID:'merchant'}
  if(url.pathname==='/rest/v1/rpc/service_confirm_mpesa_payment')return {status:'success'}
  throw new Error('Unexpected request '+url.pathname)
},async calls=>{
  const res=response();await callback(request,res)
  assert.equal(res.statusCode,200);assert.equal(res.body.status,code===0?'success':'failed')
  assert.equal(calls.some(x=>x.url.includes('service_confirm_mpesa_payment')),code===0)
}))

test('Forged callback identifiers never activate a subscription',async()=>scenario(async url=>{
  if(url.pathname==='/rest/v1/payments')return [{...payment,raw:{merchantRequestId:'different'}}]
  throw new Error('Provider must not be called for unmatched identifiers')
},async calls=>{const res=response();await callback(request,res);assert.equal(res.body.matched,false);assert.equal(calls.length,1)}))

test('Provider verification outage never claims payment success',async()=>scenario(async url=>{
  if(url.pathname==='/rest/v1/payments')return [payment]
  throw new Error('Provider unavailable')
},async()=>{const res=response();await callback(request,res);assert.equal(res.statusCode,503);assert.ok(res.body.error)}))

test('Sandbox payment does not claim Premium activation after a failed profile write',async()=>scenario(async(url,options)=>{
  if(url.pathname==='/auth/v1/user')return {id:uid,email:'qa@example.invalid'}
  if(url.pathname==='/rest/v1/profiles')return options.method==='PATCH'?Response.json({message:'Write denied'},{status:403}):{status:'active',must_change_password:false}
  if(url.pathname==='/rest/v1/payments')return {id:'payment'}
  throw new Error('Unexpected request '+url.pathname)
},async()=>{
  process.env.PAYMENTS_MODE='sandbox'
  const res=response();await start({method:'POST',headers:{authorization:'Bearer qa-token'},body:{phone:'0712345678',plan:'premium'}},res)
  assert.equal(res.statusCode,503);assert.match(res.body.error,/activation is pending/);assert.equal(res.body.started,undefined)
}))

test('Expiry sweep does not expire a concurrently renewed subscription',async()=>scenario(async(url,options)=>{
  if(url.pathname==='/rest/v1/profiles'&&options.method==='PATCH'){
    assert.equal(url.searchParams.get('subscription_expires_at'),'eq.2020-01-01T00:00:00Z')
    return []
  }
  if(url.pathname==='/rest/v1/profiles')return [{id:uid,subscription_plan:'premium',subscription_status:'active',subscription_expires_at:'2020-01-01T00:00:00Z'}]
  throw new Error('No audit entry should be created for an unchanged subscription')
},async()=>{const res=response();await expire({headers:{authorization:'Bearer qa-cron'},query:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.expired,0)}))