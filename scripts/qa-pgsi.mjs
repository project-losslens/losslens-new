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
  const context = await browser.newContext({ viewport: { width, height: 840 }, serviceWorkers: 'block' })
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
async function checkLayout(page,label){
 const info=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length}))
 assert.ok(info.scroll<=info.width+2,label+' horizontal overflow');assert.equal(info.h1,1,label+' h1');console.log(label+': PASS')
}
async function answer(page,raw=8){
 const choices=Array.from({length:9},(_,i)=>Math.max(0,Math.min(3,raw-i*3)))
 for(let i=0;i<9;i++)await page.locator(`input[name="pgsi-${i}"][value="${choices[i]}"]`).check()
}
async function send(page,text){await page.getByLabel('Message Oloo',{exact:true}).fill(text);await page.getByLabel('Send message',{exact:true}).click()}
try{
 const {context,page,state,errors}=await setup('user',360)
 await page.goto(base+'/dashboard')
 await page.getByRole('heading',{name:'Take your first self-check',exact:true}).waitFor()
 await page.getByRole('button',{name:'Remind me later',exact:true}).click()
 assert.equal(await page.locator('.pgsi-percentage').count(),0)
 await page.reload();await page.getByRole('heading',{name:'PGSI score',exact:false}).waitFor();await page.waitForTimeout(400)
 assert.equal(await page.locator('.pgsi-overlay').count(),0)
 const tab=await context.newPage();await tab.goto(base+'/dashboard');await tab.getByRole('heading',{name:'PGSI score',exact:false}).waitFor();assert.equal(await tab.locator('.pgsi-overlay').count(),0);await tab.close()
 // A genuinely new JWT session gets the next-login reminder.
 await page.evaluate(key=>{const session=JSON.parse(localStorage.getItem(key));const data=JSON.parse(atob(session.access_token.split('.')[1]));data.session_id=crypto.randomUUID();session.access_token=session.access_token.split('.')[0]+'.'+btoa(JSON.stringify(data))+'.qa';localStorage.setItem(key,JSON.stringify(session))},`sb-${project}-auth-token`)
 await page.reload();await page.getByRole('heading',{name:'Take your first self-check',exact:true}).waitFor()
 await page.getByRole('button',{name:'Take self-check',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:'Save my self-check',exact:true}).isDisabled(),true)
 for(const width of [320,360,390,768,1280]){await page.setViewportSize({width,height:840});await checkLayout(page,'Assessment '+width)}
 await page.setViewportSize({width:360,height:840})
 // Urgent help must remain above the open assessment.
 await page.locator('.pgsi-dialog__header button').focus();await page.keyboard.press('Shift+Tab')
 assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('crisis-access__trigger')),true)
 await page.keyboard.press('Enter');await page.locator('.crisis-access__sheet').waitFor()
 assert.equal(await page.evaluate(()=>{const s=document.querySelector('.crisis-access__sheet'),r=s.getBoundingClientRect();return s.contains(document.elementFromPoint(r.x+r.width/2,r.y+25))}),true)
 await page.locator('.crisis-access__close').click()
 await answer(page);state.failSave=true;await page.getByRole('button',{name:'Save my self-check',exact:true}).click()
 await page.getByText('Your self-check was not confirmed as saved.',{exact:false}).waitFor();assert.equal(state.latest,null);assert.equal(state.due,true)
 state.failSave=false;await page.getByRole('button',{name:'Save my self-check',exact:true}).click()
 await page.getByRole('heading',{name:'Support options',exact:true}).waitFor()
 assert.equal(state.submissions[0].p_submission_id,state.submissions[1].p_submission_id)
 assert.equal(state.latest.raw_score,8);assert.equal(state.api.filter(x=>x.endsWith('/crisis')).length,0)
 assert.equal(await page.locator('.crisis-access__sheet').count(),0)
 const links=await page.locator('.support-choices a[target="_blank"]').evaluateAll(nodes=>nodes.map(a=>({href:a.href,ref:a.referrerPolicy})))
 assert.equal(links.length,2);for(const link of links){assert.equal(new URL(link.href).search,'');assert.equal(link.ref,'no-referrer')}
 let opened=0
 await context.route('https://gamhelpkenya.com/**',route=>{opened++;return route.fulfill({body:'Synthetic provider destination',contentType:'text/plain'})})
 const providerPage=context.waitForEvent('page');await page.getByRole('link',{name:'Visit Gamhelp Kenya',exact:true}).click();const popup=await providerPage;await popup.waitForLoadState();assert.equal(opened,1);assert.equal(new URL(popup.url()).search,'');await popup.close()
 for(const width of [320,360,390,768,1280]){await page.setViewportSize({width,height:840});await checkLayout(page,'Voluntary support '+width)}

 await page.setViewportSize({width:360,height:840});await page.screenshot({path:'test-results/pgsi-support-mobile.png',fullPage:true})
 await page.getByRole('button',{name:'Continue to dashboard',exact:true}).click()
 await page.locator('.pgsi-percentage').getByText('30%',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Know more',exact:true}).click();await page.getByText('8/27',{exact:false}).last().waitFor()
 assert.match(await page.locator('.pgsi-overlay').innerText(),/12 months/)
 await page.locator('.pgsi-dialog__header button').click()
 await page.getByRole('checkbox',{name:'Let Oloo use',exact:false}).click();await page.waitForFunction(()=>document.querySelector('.pgsi-personalization input').checked);assert.equal(state.enabled,true)
 await page.getByRole('checkbox',{name:'Let Oloo use',exact:false}).click();await page.waitForFunction(()=>!document.querySelector('.pgsi-personalization input').checked);assert.equal(state.enabled,false)
 await page.getByLabel('Open Oloo',{exact:true}).click();await send(page,'I am thinking about kiling myslef')
 await page.getByRole('heading',{name:'Urgent human support',exact:true}).waitFor()
 await page.getByText('A human alert has not been confirmed.',{exact:false}).waitFor()
 assert.equal(state.api.some(x=>x.endsWith('/chat')),false)
 await page.screenshot({path:'test-results/oloo-crisis-mobile.png',fullPage:true})
 await page.locator('.crisis-access__close').click()
 await send(page,"I'm thinking about killing myself")
 await page.getByRole('heading',{name:'Urgent human support',exact:true}).waitFor()
 assert.notEqual(await page.locator('.crisis-access__sheet').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)')
 await page.locator('.crisis-access__close').click();await send(page,'My friend wants to kill herself')
 await page.getByRole('heading',{name:'Help someone you care about',exact:true}).waitFor()
 assert.equal(state.api.filter(x=>x.endsWith('/crisis')).length,2)
 await page.locator('.crisis-access__close').click();await send(page,'I am not suicidal')
 await page.waitForTimeout(500);assert.equal(await page.locator('.crisis-access__sheet').count(),0);assert.ok(state.api.some(x=>x.endsWith('/chat')))
 // An ordinary provider request can remain pending while a later urgent message interrupts it.
 let release,started;const requestStarted=new Promise(resolve=>{started=resolve})
 await context.route('**/api/chat',async route=>{started();await new Promise(resolve=>{release=resolve});await route.fulfill({json:{reply:'LATE ORDINARY RESPONSE MUST NOT APPEAR'}})})
 await send(page,'I need ordinary support');await requestStarted
 await send(page,'I want to end my life');await page.getByRole('heading',{name:'Urgent human support',exact:true}).waitFor();release()
 await page.locator('.crisis-access__close').click();await page.waitForTimeout(250)
 assert.equal(await page.getByText('LATE ORDINARY RESPONSE MUST NOT APPEAR',{exact:true}).count(),0)
 await page.getByLabel('Close chat',{exact:true}).click()
 await page.getByRole('button',{name:'Take another self-check',exact:true}).click();await answer(page,7)
 await page.getByRole('button',{name:'Save my self-check',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.pgsi-overlay'))
 assert.equal(state.latest.raw_score,7);assert.equal(await page.getByRole('heading',{name:'Support options',exact:true}).count(),0)
 await page.getByRole('button',{name:'Find support at any score',exact:true}).click();await page.getByRole('heading',{name:'Support options',exact:true}).waitFor()
 await page.getByRole('button',{name:'Continue to dashboard',exact:true}).click()
 await page.getByRole('button',{name:'Open crisis support options',exact:true}).click();await page.locator('.support-choices').first().waitFor();await page.getByRole('button',{name:'Close',exact:true}).last().click()
 for(const path of ['/resources','/urge-toolkit','/support']){
   await page.goto(base+path);await page.locator('.shell__content .brand-loader').first().waitFor({state:'hidden'});await page.waitForTimeout(250)
   if(path==='/urge-toolkit')await page.getByRole('button',{name:'Emergency & Support',exact:false}).click()
   await page.locator('.support-choices').first().waitFor()
   for(const width of [320,1280]){await page.setViewportSize({width,height:840});await checkLayout(page,path+' '+width)}
 }
 assert.deepEqual(errors,[]);await context.close()
 console.log('Login reminders, retry identity, raw-eight chooser, privacy, dashboard and actual Oloo submission: PASS')
 const early=await setup('user',360);early.state.profile.onboarding_completed=false;early.state.profile.ai_data_consent_at=null
 await early.page.goto(base+'/onboarding');await early.page.getByRole('heading',{name:'Your gambling self-check',exact:true}).waitFor();await checkLayout(early.page,'Onboarding mobile')
 await early.page.getByLabel('Open Oloo',{exact:true}).click();await send(early.page,'Nataka kujiua sasa')
 await early.page.getByRole('heading',{name:'Urgent human support',exact:true}).waitFor();await early.page.locator('.crisis-access__close').click();await early.page.getByLabel('Close chat',{exact:true}).click()
 await answer(early.page);await early.page.getByRole('button',{name:'Save my self-check',exact:true}).click()
 await early.page.getByRole('heading',{name:'Support options',exact:true}).waitFor();assert.equal(early.state.profile.onboarding_completed,true)
 await early.page.getByRole('button',{name:'Continue to dashboard',exact:true}).click();await early.page.waitForURL('**/dashboard')
 assert.deepEqual(early.errors,[]);await early.context.close();console.log('Pre-onboarding crisis without consent and high-score onboarding completion: PASS')
}finally{await browser.close()}
