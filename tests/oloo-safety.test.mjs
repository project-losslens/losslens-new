import test from 'node:test'
import assert from 'node:assert/strict'
import { detectCrisis } from '../src/lib/crisisDetection.js'
import { submitOlooMessage } from '../src/lib/olooSubmission.js'
import chat from '../api/chat.js'

const cases=[
 ['I am thinking about killing myself','self'],["I'm thinking about kiling myslef",'self'],['I want to end my life','self'],['Nataka kujiua sasa','self'],['Ninafikiria kujiumiza','self'],
 ['I am not suicidal','none'],["I'm not thinking about killing myself",'none'],['Sina mawazo ya kujiua','none'],['What is suicide?','none'],
 ['My friend wants to kill herself','other'],['Rafiki yangu anataka kujiua','other'],['My sister is thinking about ending her life','other'],
 ['I am not suicidal but I want to kill myself','self'],['Sitaki kujiua lakini nataka kufa','self'],['My friend is suicidal and I want to kill myself','self'],
]
for(const [message,target] of cases)test('Contextual triage: '+message,()=>assert.equal(detectCrisis(message).target,target))

test('The widget submission path opens urgent UI synchronously while reporting is pending, without invoking AI',async()=>{
 let finish,asked=0;const events=[],immediate=[]
 const pending=submitOlooMessage('I am thinking about killing myself',{ask:()=>{asked++;throw Error('AI down')},report:()=>new Promise(resolve=>{finish=resolve}),publish:event=>events.push(event),onImmediateReply:r=>immediate.push(r)})
 assert.equal(events[0].open,true);assert.equal(immediate.length,1);assert.equal(asked,0)
 finish({alertRecorded:false});const result=await pending;assert.equal(result.escalation,'unavailable');assert.equal(events.at(-1).open,false)
 assert.doesNotMatch(result.reply,/alerted|notified|contacted/i)
})
test('Third-person guidance does not report the member; negated wording uses ordinary chat',async()=>{
 let reported=0,asked=0
 const deps={report:async()=>{reported++;return{}},ask:async()=>{asked++;return{reply:'Ordinary reply'}},publish:()=>{}}
 await submitOlooMessage('My friend wants to kill herself',deps);assert.equal(reported,0);assert.equal(asked,0)
 await submitOlooMessage('I am not suicidal',deps);assert.equal(asked,1)
})

const savedEnv={...process.env},oldFetch=globalThis.fetch
process.env.VITE_SUPABASE_URL='https://pgsi-test.invalid';process.env.VITE_SUPABASE_ANON_KEY='qa-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='qa-service';process.env.GROQ_API_KEY='qa-provider'
async function invoke(message){let body;const response={setHeader(){},end(value){body=JSON.parse(value)}};await chat({method:'POST',headers:{authorization:'Bearer eyJqa'},body:{message}},response);return{status:response.statusCode,...body}}
function fixture({enabled=false,failAI=false,failAlert=false,safetyOnly=false}={}){
 const calls=[],prompts=[]
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);calls.push({url:String(url),options})
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','content-range':'*/0'}})
  if(u.pathname==='/auth/v1/user')return json({id:'11111111-1111-4111-8111-111111111111'})
  if(u.pathname.includes('record_crisis_event'))return json(failAlert?{}:'33333333-3333-4333-8333-333333333333',failAlert?503:200)
  if(safetyOnly){if(u.pathname.endsWith('/profiles')&&u.searchParams.get('select')==='status,must_change_password')return json([{status:'active',must_change_password:false}]);throw Error('Safety incorrectly depended on consent, history or provider')}
  if(u.pathname.endsWith('/profiles'))return json([{status:'active',must_change_password:false,ai_data_consent_at:'2026-11-01T00:00:00Z',subscription_plan:'free',subscription_status:'inactive'}])
  if(u.pathname.includes('pgsi_oloo_context'))return json(enabled?{band:'high',completed_at:'2026-11-24T10:00:00Z',raw_score:27,answers:[3,3,3,3,3,3,3,3,3]}:null)
  if(u.hostname==='api.groq.com'){prompts.push(JSON.parse(options.body));return json(failAI?{error:'unavailable'}:{choices:[{message:{content:'Let us talk about what you need today.'}}]},failAI?503:200)}
  return json([])
 };return{calls,prompts}
}
test('Actual /api/chat handles direct EN/SW, typos and third-person before consent/history/AI, including outage',async()=>{
 for(const [message,target]of cases.filter(([,target])=>target!=='none')){
  const {calls}=fixture({safetyOnly:true,failAlert:true});const result=await invoke(message)
  assert.equal(result.status,200,message);assert.equal(result.crisis.target,target);assert.equal(result.alertRecorded,false)
  assert.equal(calls.some(c=>c.url.includes('groq.com')||c.url.includes('chat_history')),false)
  assert.equal(calls.some(c=>c.url.includes('record_crisis_event')),target==='self')
 }
})
test('Only confirmed recording permits the internal-alert status, without claiming human contact',async()=>{
 fixture({safetyOnly:true});const result=await invoke('I want to end my life')
 assert.equal(result.status,200);assert.equal(result.alertRecorded,true);assert.doesNotMatch(result.reply,/human.*alerted|notified|contacted/i)
})
test('Actual /api/chat remains useful for crisis when neither AI nor escalation is configured',async()=>{
 fixture({safetyOnly:true});delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.GROQ_API_KEY
 const result=await invoke('Nataka kujiua');assert.equal(result.status,200);assert.equal(result.alertRecorded,false)
 process.env.SUPABASE_SERVICE_ROLE_KEY='qa-service';process.env.GROQ_API_KEY='qa-provider'
})
test('Every ordinary message obtains only current own-JWT band/date; revocation removes PGSI from the next AI prompt',async()=>{
 let f=fixture({enabled:true});let result=await invoke('I need support today');assert.equal(result.status,200)
 const call=f.calls.find(c=>c.url.includes('pgsi_oloo_context'));assert.equal(call.options.headers.Authorization,'Bearer eyJqa');assert.equal(call.options.body,'{}')
 const prompt=f.prompts[0].messages[0].content;assert.match(prompt,/band=high/);assert.match(prompt,/completed=2026-11-24/);assert.doesNotMatch(prompt,/raw_score|answers|3,3,3/)
 f=fixture({enabled:false});result=await invoke('Can we talk again?');assert.equal(result.status,200)
 assert.equal(f.calls.filter(c=>c.url.includes('pgsi_oloo_context')).length,1);assert.doesNotMatch(f.prompts[0].messages[0].content,/band=high|completed=2026-11-24/)
 f=fixture({failAI:true});result=await invoke('I am not suicidal');assert.equal(result.status,502);assert.equal(result.crisis,undefined)
})
test.after(()=>{globalThis.fetch=oldFetch;process.env=savedEnv})
