import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { recoveryDate } from '../src/lib/calendar.js'
import { checkedMutation } from '../src/lib/mutations.js'
import { recentlyAuthenticated } from '../supabase/functions/_shared/authFreshness.js'
import { effectivePlan } from '../src/lib/entitlements.js'
import { canAccessPath, safeInternalPath, requireAuthDecision, publicOnlyDecision } from '../src/config/roleHome.js'

for (const [value,expected] of [
  ['2026-11-24T00:30:00+03:00','2026-11-24'],
  ['2026-11-23T23:59:59+03:00','2026-11-23'],
  ['2026-12-31T22:00:00Z','2027-01-01'],
]) test('Recovery calendar: '+value,()=>assert.equal(recoveryDate(value),expected))

test('A zero-row write is an error, never a success',async()=>assert.ok((await checkedMutation(Promise.resolve({data:[],error:null}))).error))
test('Database denial is preserved',async()=>{const error=new Error('Denied');assert.equal((await checkedMutation(Promise.resolve({data:null,error}))).error,error)})
test('Transport failures become actionable errors',async()=>assert.match((await checkedMutation(Promise.reject(new Error('Offline')))).error.message,/Offline/))
test('A confirmed write retains returned rows',async()=>assert.deepEqual((await checkedMutation(Promise.resolve({data:[{id:'saved'}],error:null}))).data,[{id:'saved'}]))

test('Token refresh does not satisfy recent authentication',()=>assert.equal(recentlyAuthenticated({iat:10000,amr:[{method:'password',timestamp:100}]},10000),false))
test('A fresh password challenge satisfies recent authentication',()=>assert.equal(recentlyAuthenticated({amr:[{method:'password',timestamp:9900}]},10000),true))
test('Missing, future or unknown auth events fail closed',()=>{for(const payload of [{iat:10000},{amr:[{method:'password',timestamp:11000}]},{amr:[{method:'refresh_token',timestamp:10000}]}])assert.equal(recentlyAuthenticated(payload,10000),false)})

test('Expired Premium resolves to Free for renewal',()=>assert.equal(effectivePlan({subscription_plan:'premium',subscription_status:'active',subscription_expires_at:'2020-01-01'}),'free'))
test('Restricted roles cannot enter member/admin applications',()=>{for(const [role,path]of [['user','/admin'],['admin','/super-admin/users'],['therapist','/dashboard'],['insurer','/diary']])assert.equal(canAccessPath(role,path),false)})
test('Role navigation and safe redirects',()=>{for(const[role,path]of [['super_admin','/super-admin/insurance'],['admin','/admin/events'],['therapist','/therapist/sessions'],['insurer','/insurer/claims']])assert.equal(canAccessPath(role,path),true);for(const path of ['//evil.invalid','/\\evil.invalid','https://evil.invalid'])assert.equal(safeInternalPath(path),null)})

async function recordingClient({metadataError=null,uploadError=null}={}){
  const calls=[]
  const client={storage:{from:()=>({upload:async()=>{calls.push('upload');return {error:uploadError}},remove:async()=>{calls.push('cleanup');return {error:null}}})},from:()=>({insert:()=>({select:()=>({single:async()=>{calls.push('metadata');return {data:metadataError?null:{id:'saved'},error:metadataError}}})})})}
  let source=await fs.readFile(new URL('../src/lib/recordings.js',import.meta.url),'utf8')
  globalThis.__recordingClient=client
  source=source.replace("import { supabase } from './supabase'",'const supabase = globalThis.__recordingClient')
  const module=await import('data:text/javascript;base64,'+Buffer.from(source+'\n//'+Math.random()).toString('base64'))
  return {save:()=>module.saveRecording('bucket','table','owner/file',new Blob(['recording']),{user_id:'owner'}),calls}
}
test('Failed metadata save compensates upload and rejects success',async()=>{const {save,calls}=await recordingClient({metadataError:new Error('DB unavailable')});await assert.rejects(save,/DB unavailable/);assert.deepEqual(calls,['upload','metadata','cleanup'])})
test('Failed upload never creates a phantom metadata row',async()=>{const{save,calls}=await recordingClient({uploadError:new Error('Storage unavailable')});await assert.rejects(save,/Storage unavailable/);assert.deepEqual(calls,['upload'])})
test('Recording success requires storage and metadata',async()=>{const{save,calls}=await recordingClient();assert.deepEqual(await save(),{id:'saved'});assert.deepEqual(calls,['upload','metadata'])})

test('Offline syncing shares one run, isolates accounts and survives reentrant notifications',async()=>{
  let writes=0,attempts=0;const removed=[]
  let sync
  globalThis.__offlineQA={
    supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}}})},from:()=>({upsert:()=>({select:()=>({single:async()=>{writes++;await new Promise(r=>setTimeout(r,10));return {data:{id:'saved'},error:null}}})})})},
    listOfflineItems:async()=>[{id:1,kind:'urge_session',payload:{user_id:'other'}},{id:2,kind:'urge_session',payload:{user_id:'owner'}}],
    removeOfflineItem:async id=>{removed.push(id);void sync()},markOfflineItemAttempt:async()=>{attempts++},onOfflineQueueChange:()=>()=>{},
  }
  let source=await fs.readFile(new URL('../src/lib/offlineSync.js',import.meta.url),'utf8')
  source=source.replace("import { recoveryDate } from './calendar'",'const recoveryDate=()=>"2026-11-24"').replace("import { supabase } from './supabase'",'const supabase=globalThis.__offlineQA.supabase').replace(/import \{[\s\S]*?\} from '.\/offlineQueue'/,'const {listOfflineItems,removeOfflineItem,markOfflineItemAttempt,onOfflineQueueChange}=globalThis.__offlineQA')
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
  sync=module.syncOfflineQueue
  const a=sync(),b=sync();assert.equal(a,b)
  assert.deepEqual(await a,{synced:1,failed:0});assert.equal(writes,1);assert.deepEqual(removed,[2]);assert.equal(attempts,0)
})

test('All literal RPC calls and relative server imports resolve',async()=>{
  const files=async dir=>(await fs.readdir(dir,{withFileTypes:true})).flatMap(entry=>entry.isDirectory()?[]:[dir+'/'+entry.name])
  const sql=(await Promise.all((await files('supabase/migrations')).map(file=>fs.readFile(file,'utf8')))).join('\n')
  const functions=new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi)].map(m=>m[1]))
  async function walk(dir){const out=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())out.push(...await walk(p));else if(/\.(js|jsx|ts)$/.test(p))out.push(p)}return out}
  for(const file of [...await walk('src'),...await walk('api')]){
    const source=await fs.readFile(file,'utf8')
    for(const m of source.matchAll(/\.rpc\(['"]([^'"]+)['"]/g))assert.ok(functions.has(m[1]),file+': missing RPC '+m[1])
  }
  await import('../api/payments/mpesa-callback.js')
})
test('Consolidated route decisions retain suspension, session and role boundaries',()=>{
  assert.equal(requireAuthDecision({authStatus:'ready',status:'suspended',currentRole:'user'}),'suspended')
  for(const [authStatus,expected]of [['loading','loading'],['error','error'],['no-session','no-session']])assert.equal(requireAuthDecision({authStatus}),expected)
  assert.equal(requireAuthDecision({authStatus:'ready',currentRole:'user',path:'/super-admin/users'}),'redirect')
  assert.equal(requireAuthDecision({authStatus:'ready',currentRole:'insurer'}),'ready-other-role')
  assert.equal(requireAuthDecision({authStatus:'ready',currentRole:'admin',role:'super_admin',isAdmin:true,isSuperAdmin:false}),'redirect')
  assert.equal(requireAuthDecision({authStatus:'ready',currentRole:'user',path:'/dashboard'}),'allow')
  assert.equal(publicOnlyDecision({authStatus:'ready',user:{id:'member'}}),'redirect')
  assert.equal(publicOnlyDecision({authStatus:'no-session',user:null}),'allow')
})

test('Client and server relative imports exist with exact path casing',async()=>{
  const {default:path}=await import('node:path')
  async function walk(dir){let files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else if(/\.(?:js|jsx)$/.test(p))files.push(p)}return files}
  const directoryNames=new Map()
  async function exact(file){const absolute=path.resolve(file),relative=path.relative(process.cwd(),absolute);assert.ok(!relative.startsWith('..'),'Import escapes workspace: '+file);const parts=relative.split(path.sep);let parent=process.cwd();for(const part of parts){if(!directoryNames.has(parent))directoryNames.set(parent,await fs.readdir(parent));const entries=directoryNames.get(parent);assert.ok(entries.includes(part),'Wrong import path casing: '+file);parent=path.join(parent,part)}}
  for(const file of [...await walk('src'),...await walk('api')]){
    const source=await fs.readFile(file,'utf8')
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)){
      if(!match[1].startsWith('.'))continue
      const base=path.resolve(path.dirname(file),match[1]),candidates=[base,base+'.js',base+'.jsx',path.join(base,'index.js')];let resolved
      for(const candidate of candidates){try{if((await fs.stat(candidate)).isFile()){resolved=candidate;break}}catch{/* Try the next supported Vite file extension. */}}
      assert.ok(resolved,file+': unresolved '+match[1]);await exact(resolved)
    }
  }
})
