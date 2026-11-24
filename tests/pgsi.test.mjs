import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { PGSI_VERSION } from '../src/config/pgsi.js'
import { pgsiBand, pgsiPercentage, pgsiIsDue, validPgsiAnswers, PGSI_INTERVAL_MS, claimLoginReminder, sessionLoginKey } from '../src/lib/pgsi.js'
import { befriendersAvailability } from '../src/lib/supportAvailability.js'

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const db=new PGlite()
await db.exec(`
  create role authenticated; create role anon; create role service_role bypassrls;
  create schema auth; grant usage on schema auth,public to authenticated,anon,service_role;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.profiles(id uuid primary key,role text,status text default 'active',must_change_password boolean default false,goal text,onboarding_completed boolean default false,onboarding_skipped boolean default false,screening_score int);
  create function public.current_user_role() returns text language sql stable security definer as $$select role from public.profiles where id=auth.uid()$$;
  create function public.is_active_user() returns boolean language sql stable security definer as $$select coalesce((select status='active' and not must_change_password from public.profiles where id=auth.uid()),false)$$;
  insert into public.profiles(id,role,screening_score) values('${a}','user',8),('${b}','user',1);
`)
await db.exec(await fs.readFile(new URL('../supabase/migrations/20261124000010_private_pgsi.sql',import.meta.url),'utf8'))
async function asUser(id=a){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')}
async function rpc(sql,args=[]){return (await db.query('select '+sql+' as result',args)).rows[0].result}
function answersFor(raw){return Array.from({length:9},(_,i)=>Math.max(0,Math.min(3,raw-i*3)))}
async function submit(raw,id=crypto.randomUUID(),extra=false){return rpc('public.submit_pgsi($1,$2::jsonb,$3,$4,$5)',[id,JSON.stringify(answersFor(raw)),PGSI_VERSION,extra,extra?'Cut down':null])}

test('Existing 1-8 legacy screening does not become a PGSI result',async()=>{await asUser();const state=await rpc('public.pgsi_latest()');assert.equal(state.latest,null);assert.equal(state.due,true);assert.equal(state.personalization_enabled,false)})
for(const raw of [0,1,2,3,7,8,27])test('PostgreSQL scores '+raw+' and uses the raw band',async()=>{
  await asUser();const result=await submit(raw);assert.equal(result.raw_score,raw);assert.equal(result.band,pgsiBand(raw));assert.equal(result.questionnaire_version,PGSI_VERSION)
  assert.equal(Date.parse(result.next_due_at)-Date.parse(result.completed_at),PGSI_INTERVAL_MS)
  assert.equal('answers' in result,false);assert.equal('user_id' in result,false)
})
test('Percentage is rounded only for display, especially 8/27 = 30%',()=>{assert.equal(pgsiPercentage(8),30);for(const [raw,percent]of [[0,0],[1,4],[2,7],[3,11],[7,26],[27,100]])assert.equal(pgsiPercentage(raw),percent);assert.throws(()=>pgsiPercentage(null))})
test('Unanswered, missing, string, fractional and out-of-range answers are rejected by PostgreSQL',async()=>{
  await asUser();for(const answers of [[],Array(8).fill(0),[null,...Array(8).fill(0)],['0',...Array(8).fill(0)],[0.5,...Array(8).fill(0)],[4,...Array(8).fill(0)]]){
    assert.equal(validPgsiAnswers(answers),false)
    await assert.rejects(()=>rpc('public.submit_pgsi($1,$2::jsonb,$3)',[crypto.randomUUID(),JSON.stringify(answers),PGSI_VERSION]))
  }
  assert.equal(validPgsiAnswers(Array(9)),false)
})
test('Retry returns the same assessment and timestamp; a reused ID cannot change answers',async()=>{
  await asUser();const id=crypto.randomUUID(),first=await submit(8,id),again=await submit(8,id)
  assert.deepEqual(first,again)
  await assert.rejects(()=>submit(27,id))
  const count=(await db.query('select count(*)::int as count from public.pgsi_assessments where submission_id=$1',[id])).rows[0].count
  assert.equal(count,1)
})
test('Onboarding completion and server scoring commit together without modifying legacy ratings',async()=>{
  await asUser();await submit(8,crypto.randomUUID(),true);await db.exec('reset role')
  const profile=(await db.query('select * from public.profiles where id=$1',[a])).rows[0]
  assert.equal(profile.onboarding_completed,true);assert.equal(profile.goal,'Cut down');assert.equal(profile.screening_score,8)
})
test('The exact seven-day boundary is due; a failed assessment leaves it due',async()=>{
  const completed=Date.parse('2026-11-01T10:00:00Z')
  assert.equal(pgsiIsDue(completed,completed+PGSI_INTERVAL_MS-1),false)
  assert.equal(pgsiIsDue(completed,completed+PGSI_INTERVAL_MS),true)
  await asUser();await submit(0);await db.exec('reset role')
  await db.query("update public.pgsi_assessments set completed_at=clock_timestamp()-interval '168 hours' where user_id=$1",[a]);await asUser()
  assert.equal((await rpc('public.pgsi_latest()')).due,true)
  await assert.rejects(()=>rpc('public.submit_pgsi($1,$2::jsonb,$3)',[crypto.randomUUID(),'[0]',PGSI_VERSION]))
  assert.equal((await rpc('public.pgsi_latest()')).due,true)
  await submit(7);assert.equal((await rpc('public.pgsi_latest()')).due,false)
})
test('A member cannot read another account, supply another owner, or fabricate a stored score',async()=>{
  await asUser(b);await submit(27)
  await asUser(a);assert.equal((await db.query('select * from public.pgsi_assessments where user_id=$1',[b])).rows.length,0)
  await assert.rejects(()=>db.query('insert into public.pgsi_assessments(user_id,submission_id,questionnaire_version,answers,raw_score) values($1,$2,$3,$4::jsonb,27)',[a,crypto.randomUUID(),PGSI_VERSION,JSON.stringify(Array(9).fill(0))]))
  assert.equal((await rpc('public.pgsi_latest()')).latest.raw_score,7)
})
test('Insurer, therapist, admin, super-admin and anonymous roles have no assessment view',async()=>{
  for(const role of ['insurer','therapist','admin','super_admin']){
    const id=crypto.randomUUID();await db.exec('reset role');await db.query('insert into public.profiles(id,role) values($1,$2)',[id,role]);await asUser(id)
    assert.equal((await db.query('select * from public.pgsi_assessments')).rows.length,0)
    await assert.rejects(()=>rpc('public.pgsi_latest()'))
    assert.equal(await rpc('public.pgsi_oloo_context()'),null)
  }
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from public.pgsi_assessments'))
})
test('Oloo context is opt-in, restricted to band/date, and revocation works immediately',async()=>{
  await asUser(a);assert.equal(await rpc('public.pgsi_oloo_context()'),null)
  await rpc('public.pgsi_set_personalization(true)');const context=await rpc('public.pgsi_oloo_context()')
  assert.deepEqual(Object.keys(context).sort(),['band','completed_at']);assert.equal(context.band,'moderate')
  await rpc('public.pgsi_set_personalization(false)');assert.equal(await rpc('public.pgsi_oloo_context()'),null)
})
test('Reminder dismissal lasts for a login, not a refresh, tab switch or restored session',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}
  assert.equal(claimLoginReminder(storage,a,'login-one',true),true)
  assert.equal(claimLoginReminder(storage,a,'login-one',true),false)
  assert.equal(claimLoginReminder(storage,a,'login-two',true),true)
  assert.equal(claimLoginReminder(storage,b,'login-one',true),true)
  assert.equal(claimLoginReminder(storage,a,'login-three',false),false)
  assert.equal(claimLoginReminder(storage,a,'login-three',true),false)
  const session=id=>({user:{id:a},access_token:'qa.'+Buffer.from(JSON.stringify({session_id:id,iat:Date.now()})).toString('base64url')+'.qa'})
  assert.equal(sessionLoginKey(session('same')),sessionLoginKey(session('same')))
  assert.notEqual(sessionLoginKey(session('same')),sessionLoginKey(session('new')))
})
for(const [time,open,next]of [
  ['2026-11-23T05:59:59Z',false,'2026-11-23T06:00:00.000Z'],
  ['2026-11-23T06:00:00Z',true,null],
  ['2026-11-23T13:59:59Z',true,null],
  ['2026-11-23T14:00:00Z',false,'2026-11-24T06:00:00.000Z'],
  ['2026-11-27T14:00:00Z',false,'2026-11-30T06:00:00.000Z'],
  ['2026-11-28T09:00:00Z',false,'2026-11-30T06:00:00.000Z'],
  ['2026-11-29T20:00:00Z',false,'2026-11-30T06:00:00.000Z'],
])test('Nairobi published hours: '+time,()=>{const result=befriendersAvailability(time);assert.equal(result.open,open);assert.equal(result.nextOpensAt,next)})
test.after(async()=>db.close())