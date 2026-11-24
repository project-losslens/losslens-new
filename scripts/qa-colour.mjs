import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { loadEnv } from 'vite'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173'
const env = loadEnv('development', process.cwd(), '')
const project = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
const now = Math.floor(Date.now() / 1000)
const actorId = '11111111-1111-4111-8111-111111111111'
const targetId = '22222222-2222-4222-8222-222222222222'
const browserPath = process.env.QA_BROWSER_PATH
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) })
const failures = [], results = []
fs.mkdirSync('test-results', { recursive: true })

async function setup(role, width = 360) {
  const context = await browser.newContext({ viewport: { width, height: 840 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
  const actor = { id: actorId, role, status: 'active', username: 'qa_actor', full_name: 'QA Actor', onboarding_completed: true, subscription_plan: 'free', subscription_status: 'inactive', money_saved: 0, streak_days: 0, badges: [], ai_data_consent_at: new Date().toISOString(), created_at: new Date().toISOString(), circle_user_hash: 'qa_actor_hash' }
  const target = { ...actor, id: targetId, role: 'user', username: 'qa_member', full_name: 'QA Member', email: 'qa@example.invalid' }
  const state = { latest: null, due: true, enabled: false, failSave: false, submissions: [], api: [], partners: [], zeroWrite: false, denyWrite: false, profile: actor, target, requests: [] }
  const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: actorId, exp: now + 3600, iat: now, role: 'authenticated', amr: [{method:'password',timestamp:now}] })).toString('base64url'), 'qa'].join('.')
  await context.addInitScript(({key, jwt, id, role}) => {
    if (role && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ access_token: jwt, refresh_token: 'qa-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, expires_in:3600, user:{ id, email:'actor@example.invalid', aud:'authenticated', role:'authenticated', user_metadata:{} } }))
    localStorage.setItem('losslens_remember_me','true')
  }, {key:`sb-${project}-auth-token`,jwt,id:actorId,role})
  await context.route('**/api/**', route => {
    state.api.push(route.request().url()); if (route.request().url().includes('/payments/config')) return route.fulfill({json:{ available:false,amount:500,currency:'KES' }})
    return route.fulfill({status:503,json:{error:'QA service unavailable'}})
  })
  await context.route(`${env.VITE_SUPABASE_URL}/**`, async route => {
    const req=route.request(), url=new URL(req.url()), method=req.method()
    state.requests.push({path:url.pathname,method,body:req.postData()})
    if(url.pathname.startsWith('/auth/')) return route.fulfill({json:{id:actorId,email:'actor@example.invalid',user_metadata:{}}})
    const rpc=url.pathname.split('/rpc/')[1]
    if(rpc){
      const body=req.postDataJSON() || {}
      if(rpc==='pgsi_latest')return route.fulfill({json:{latest:state.latest,due:state.due,personalization_enabled:state.enabled}})
      if(rpc==='pgsi_set_personalization'){state.enabled=body.p_enabled;return route.fulfill({json:{enabled:state.enabled}})}
      if(rpc==='submit_pgsi'){
        state.submissions.push(body)
        if(state.failSave)return route.fulfill({status:503,json:{message:'Save unavailable'}})
        const raw=body.p_answers.reduce((a,b)=>a+b,0)
        state.latest={id:crypto.randomUUID(),raw_score:raw,band:raw===0?'none':raw<=2?'low':raw<=7?'moderate':'high',completed_at:new Date().toISOString(),questionnaire_version:body.p_version};state.due=false
        if(body.p_complete_onboarding)state.profile.onboarding_completed=true
        return route.fulfill({json:state.latest})
      }
      if(rpc==='admin_set_user_status'){

        if(state.denyWrite)return route.fulfill({status:403,json:{message:'Denied in QA'}})
        if(state.zeroWrite)return route.fulfill({json:null})
        state.target.status=body.p_status
        return route.fulfill({json:{id:targetId,status:body.p_status}})
      }
      if(rpc==='username_available')return route.fulfill({json:true})
      if(rpc==='recompute_progress')return route.fulfill({json:{streak_days:0,new_badges:[]}})
      if(rpc==='member_company_summary')return route.fulfill({json:null})
      if(rpc.includes('list')||rpc.includes('get_rooms'))return route.fulfill({json:[]})
      return route.fulfill({json:[]})
    }
    const table=url.pathname.split('/rest/v1/')[1]
    let rows=[]
    if(table==='profiles')rows=url.searchParams.get('id')===`eq.${actorId}`?[state.profile]:[state.profile,state.target]
    if(table==='insurance_partners'){
      if(method!=='GET'&&method!=='HEAD'){
        if(state.denyWrite)return route.fulfill({status:403,json:{message:'Denied in QA'}})
        if(state.zeroWrite)return route.fulfill({json:[]})
        const body=req.postDataJSON(), id=url.searchParams.get('id')?.slice(3)
        if(method==='POST'){const row={...body,id:crypto.randomUUID(),created_at:new Date().toISOString()};state.partners.push(row);rows=[row]}
        if(method==='PATCH'){const row=state.partners.find(x=>x.id===id);if(row)Object.assign(row,body);rows=row?[row]:[]}
        if(method==='DELETE'){rows=state.partners.filter(x=>x.id===id);state.partners=state.partners.filter(x=>x.id!==id)}
      }else rows=state.partners
    }
    if(table==='system_settings')rows=[{key:'protection_mode',value:'off'}]
    const singular=req.headers().accept?.includes('vnd.pgrst.object')
    return route.fulfill({status:200,headers:{'content-range':`0-${Math.max(rows.length-1,0)}/${rows.length}`},json:singular?(rows[0]??null):rows})
  })
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  return {context,page,state,errors}
}
const phase=process.env.QA_THEME_PHASE || 'after'
if(phase==='before'){
 try{
  for(const width of [390,1440])for(const [role,url,label]of [[null,'/','homepage'],['user','/dashboard','dashboard']]){
   const sample=await setup(role,width);sample.state.latest={id:crypto.randomUUID(),raw_score:8,band:'high',completed_at:new Date().toISOString()};sample.state.due=false
   await sample.page.goto(base+url);await sample.page.locator('h1').first().waitFor();await sample.page.locator('.brand-loader').first().waitFor({state:'hidden'});await sample.page.evaluate(()=>document.fonts.ready);await sample.page.waitForTimeout(400)
   await sample.page.screenshot({path:'test-results/theme-before-'+label+'-'+width+'.png',fullPage:false});console.log('Before: '+label+' '+width)
   await sample.context.close()
  }
 }finally{await browser.close()}
 process.exit(0)
}
const palette=['rgb(200, 166, 224)','rgb(234, 217, 243)','rgb(53, 16, 68)','rgb(135, 54, 176)']
async function examine(page,label){
 await page.evaluate(()=>document.fonts.ready)
 const info=await page.evaluate(palette=>{
  let total=0,purple=0;const colors={}
  for(let y=15;y<Math.min(innerHeight,840);y+=28)for(let x=15;x<innerWidth;x+=28){
   let el=document.elementFromPoint(x,y);if(!el||el.closest('button,a,input,svg,.ll-brand'))continue
   let color='';while(el){const c=getComputedStyle(el).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){color=c;break}el=el.parentElement}
   total++;if(palette.includes(color))purple++;colors[color]=(colors[color]||0)+1
  }
  return{ratio:purple/total,colors,width:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length}
 },palette)
 assert.ok(info.scroll<=info.width+2,label+' overflow');assert.equal(info.h1,1,label+' heading');assert.ok(info.ratio>=.75,label+' must remain purple without buttons/logo: '+JSON.stringify(info));console.log(label+': '+Math.round(info.ratio*100)+'% purple surfaces')
 await page.screenshot({path:'test-results/theme-after-'+label+'.png',fullPage:false})
 const mask=await page.addStyleTag({content:'button, a.ll-btn, .ll-brand, .sidebar__brand, .brand-logo { visibility:hidden !important; }'})
 await page.screenshot({path:'test-results/colour-'+label+'-covered.png',fullPage:false});await mask.evaluate(el=>el.remove())
}
try{
 for(const width of [390,1440]){
  const guest=await setup(null,width)
  for(const [url,label]of [['/','homepage'],['/protection','protection'],['/login','signin']]){
   await guest.page.goto(base+url);await guest.page.locator('h1').first().waitFor();await guest.page.waitForTimeout(250)
   await examine(guest.page,label+'-'+width)
   if(label==='homepage'){
    const action=guest.page.locator('.hp-hero__actions .hp-button--light, .ll-hero .ll-btn--primary');await action.hover();assert.equal(await action.evaluate(el=>getComputedStyle(el).color),palette[2]);await guest.page.mouse.move(0,0)
   }
   if(label==='homepage'){const gradient=await guest.page.locator('.ll-hero').evaluate(el=>getComputedStyle(el).backgroundImage);if(gradient==='none')assert.equal(await guest.page.locator('.ll-hero').evaluate(el=>getComputedStyle(el).backgroundColor),palette[2]);else assert.ok(gradient.includes(palette[2])&&gradient.includes(palette[3]))}
   if(label==='protection')assert.equal(await guest.page.locator('.protection-hero').evaluate(el=>getComputedStyle(el).backgroundColor),palette[2])
  }
  assert.deepEqual(guest.errors,[]);await guest.context.close()
  const member=await setup('user',width);member.state.latest={id:crypto.randomUUID(),raw_score:8,band:'high',completed_at:new Date().toISOString()};member.state.due=false
  await member.context.route('**/api/chat',route=>route.fulfill({json:{reply:'It sounds like this has been a difficult day. We can take a moment to reflect on what happened and choose one practical next step. You can keep talking, or explore the support options whenever you want.'}}))
  await member.page.goto(base+'/dashboard');await member.page.locator('.pgsi-percentage').waitFor();await examine(member.page,'dashboard-'+width)
  assert.equal(await member.page.locator('.shell__header').evaluate(el=>getComputedStyle(el).backgroundColor),palette[2]);assert.equal(await member.page.locator('.dashboard-summary').evaluate(el=>getComputedStyle(el).backgroundColor),palette[2])
  assert.equal(await member.page.locator('.pgsi-percentage').evaluate(el=>getComputedStyle(el).color),palette[2])
  await member.page.getByLabel('Open Oloo',{exact:true}).click();await member.page.getByLabel('Message Oloo',{exact:true}).fill('I had a difficult day and would like to reflect on it.');await member.page.getByLabel('Send message',{exact:true}).click()
  await member.page.getByText('It sounds like this has been a difficult day.',{exact:false}).waitFor()
  assert.equal(await member.page.locator('.oloo-conversation').evaluate(el=>getComputedStyle(el).backgroundColor),palette[0])
  await examine(member.page,'oloo-'+width)
  // Keyboard focus remains visible on the composer; palette changes never remove outlines.
  await member.page.getByLabel('Message Oloo',{exact:true}).focus();await member.page.keyboard.press('Tab');assert.notEqual(await member.page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none')
  assert.deepEqual(member.errors,[]);await member.context.close()
 }
 for(const [role,url]of [['admin','/admin'],['super_admin','/super-admin/users'],['therapist','/therapist'],['insurer','/insurer'],['user','/support'],['user','/onboarding']]){
  const sample=await setup(role,390);if(url==='/onboarding')sample.state.profile.onboarding_completed=false
  sample.state.due=false;await sample.page.goto(base+url);await sample.page.locator('h1').first().waitFor();await sample.page.locator('.brand-loader').first().waitFor({state:'hidden'});await sample.page.waitForTimeout(300)
  await examine(sample.page,role+'-'+url.replaceAll('/','_'));assert.deepEqual(sample.errors,[]);await sample.context.close()
 }
 console.log('Desktop/mobile purple surface acceptance, readable score, chat submission and keyboard focus: PASS')
}finally{await browser.close()}
