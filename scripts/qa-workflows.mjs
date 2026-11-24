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
  const state = { partners: [], zeroWrite: false, denyWrite: false, profile: actor, target, requests: [] }
  const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: actorId, exp: now + 3600, iat: now, role: 'authenticated', amr: [{method:'password',timestamp:now}] })).toString('base64url'), 'qa'].join('.')
  await context.addInitScript(({key, jwt, id, role}) => {
    if (role) localStorage.setItem(key, JSON.stringify({ access_token: jwt, refresh_token: 'qa-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, expires_in:3600, user:{ id, email:'actor@example.invalid', aud:'authenticated', role:'authenticated', user_metadata:{} } }))
    localStorage.setItem('losslens_remember_me','true')
  }, {key:`sb-${project}-auth-token`,jwt,id:actorId,role})
  await context.route('**/api/**', route => {
    if (route.request().url().includes('/payments/config')) return route.fulfill({json:{ available:false,amount:500,currency:'KES' }})
    return route.fulfill({status:503,json:{error:'QA service unavailable'}})
  })
  await context.route(`${env.VITE_SUPABASE_URL}/**`, async route => {
    const req=route.request(), url=new URL(req.url()), method=req.method()
    state.requests.push({path:url.pathname,method,body:req.postData()})
    if(url.pathname.startsWith('/auth/')) return route.fulfill({json:{id:actorId,email:'actor@example.invalid',user_metadata:{}}})
    const rpc=url.pathname.split('/rpc/')[1]
    if(rpc){
      const body=req.postDataJSON() || {}
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
async function inspect(page, label, errors) {
  await page.locator('.shell__content .brand-loader').first().waitFor({state:'hidden',timeout:20000})
  await page.waitForTimeout(450)
  const layout=await page.evaluate(()=>({
    width:innerWidth,scroll:document.documentElement.scrollWidth, pathname:location.pathname,
    h1:document.querySelectorAll('h1').length,
    overflow:[...document.querySelectorAll('body *')].filter(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el)
      return r.width>0&&r.right>innerWidth+2&&s.position!=='fixed'&&!el.closest('table, .sidebar, [inert]')
    }).slice(0,5).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,55)})),
    crashed:/Something went wrong|Unexpected error/i.test(document.body.innerText),
  }))
  if(layout.h1!==1||layout.pathname!==label.split(' ').at(-1)||layout.scroll>layout.width+2||layout.crashed||errors.length) failures.push({label,...layout,errors:[...errors]})
  results.push({label,...layout,errors:[...errors]})
  console.log(label,layout.scroll>layout.width+2?'OVERFLOW':layout.crashed?'CRASH':errors.length?'ERROR':'OK')
}
try {
  const groups={
    guest:['/','/login','/signup','/pricing','/about','/partners','/protection','/protection/actuarial','/privacy','/terms'],
    user:['/dashboard','/diary','/cbt','/urge-toolkit','/circle','/whispers','/events','/resources','/profile','/precious-pact','/monthly-mirror','/family-portal','/subscription','/protection-member','/support'],
    admin:['/admin','/admin/events','/admin/groups','/admin/resources','/admin/analytics','/admin/broadcast','/admin/crisis','/admin/support'],
    super_admin:['/super-admin/users','/super-admin/insurance','/super-admin/b2b','/super-admin/grants','/super-admin/chats','/super-admin/logs','/super-admin/settings','/super-admin/therapists','/super-admin/insurers','/super-admin/float','/super-admin/protection','/super-admin/actuarial'],
    therapist:['/therapist','/therapist/onboarding','/therapist/claims/new','/therapist/referrals','/therapist/sessions','/therapist/claims','/therapist/payouts','/therapist/milestones'],
    insurer:['/insurer','/insurer/claims','/insurer/invoices','/insurer/analytics','/insurer/members','/insurer/pre-auths','/insurer/plans'],
  }
  for(const [role,routes]of Object.entries(groups)){
    if (process.env.QA_ROLE && role !== process.env.QA_ROLE) continue
    const {context,page,errors}=await setup(role==='guest'?null:role)
    for(const width of [360,1280]){
      await page.setViewportSize({width,height:840})
      for(const route of routes){errors.length=0;await page.goto(base+route);await page.locator(role === 'guest' ? 'h1' : '.shell').first().waitFor({state:'visible', timeout:20000});await page.waitForTimeout(400);await inspect(page,`${role} ${width} ${route}`,errors)}
    }
    await context.close()
  }
  // Partner writes: denied/zero-row operations must never display success.
  const {context,page,state}=await setup('super_admin')
  await page.goto(base+'/super-admin/insurance')
  await page.getByRole('button',{name:'Add Partner',exact:true}).click()
  await page.getByPlaceholder('e.g. Jubilee Insurance').fill('QA Insurance')
  await page.getByPlaceholder('john@jubilee.co.ke').fill('partner@example.invalid')
  state.zeroWrite=true
  await page.getByRole('button',{name:'Add Partner',exact:true}).last().click()
  await page.locator('.ll-toast--error').waitFor()
  assert.equal(state.partners.length,0)
  assert.equal(await page.locator('.ll-toast--success').count(),0)
  state.zeroWrite=false
  await page.getByRole('button',{name:'Add Partner',exact:true}).last().click()
  await page.locator('.ll-toast--success').waitFor()
  assert.equal(state.partners.length,1)
  await page.reload()
  await page.getByText('QA Insurance',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Edit',exact:true}).click()
  await page.getByPlaceholder('e.g. Jubilee Insurance').fill('Updated QA Insurance')
  await page.getByRole('button',{name:'Update Partner',exact:true}).click()
  await page.getByText('Updated QA Insurance',{exact:true}).waitFor()
  assert.equal(state.partners[0].company_name,'Updated QA Insurance')
  for (const width of [320,360,390,414,768]) {
    await page.setViewportSize({width,height:840})
    await inspect(page,`super_admin ${width} /super-admin/insurance`,[])
  }
  await page.setViewportSize({width:360,height:840})
  await page.screenshot({path:'test-results/insurance-mobile.png',fullPage:true})
  console.log('Partner create / zero-row failure / persistence / edit: PASS')
  // Delete is reflected in the ledger, not just a toast.
  await page.getByRole('button',{name:'Delete',exact:true}).first().click()
  await page.getByRole('button',{name:'Delete',exact:true}).last().click()
  await page.waitForTimeout(300)
  assert.equal(state.partners.length,0)
  // Status failures must not change the user; verified status writes must persist.
  await page.goto(base+'/super-admin/users')
  await page.getByRole('button',{name:'Expand',exact:true}).last().click()
  await page.getByRole('button',{name:'Suspend',exact:true}).click()
  state.zeroWrite=true
  await page.getByRole('button',{name:'Suspend',exact:true}).last().click()
  await page.locator('.ll-toast--error').last().waitFor()
  assert.equal(state.target.status,'active')
  state.zeroWrite=false
  await page.getByRole('button',{name:'Suspend',exact:true}).click()
  await page.getByRole('button',{name:'Suspend',exact:true}).last().click()
  await page.waitForTimeout(300)
  assert.equal(state.target.status,'suspended')
  // Test a real mobile drawer link click and its destination.
  await page.locator('.shell__toggle').click()
  await page.locator('.sidebar__link[href="/super-admin/insurance"]').click()
  await page.waitForURL('**/super-admin/insurance')
  assert.equal(new URL(page.url()).pathname,'/super-admin/insurance')
  console.log('Partner deletion / user-status failure and success / mobile menu link: PASS')
  await context.close()
  const member = await setup('user')
  await member.page.goto(base+'/dashboard')
  await member.page.locator('.oloo-widget').waitFor({timeout:20000})
  const overlap = await member.page.evaluate(() => {
    const a=document.querySelector('.oloo-widget').getBoundingClientRect()
    const b=document.querySelector('.crisis-access__trigger').getBoundingClientRect()
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  })
  assert.equal(overlap,false,'Oloo and help controls must not overlap')
  await member.page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true})
  await member.context.close()
  console.log('Mobile Oloo/help separation: PASS')
  const onboarding = await setup('user')
  await onboarding.page.goto(base+'/onboarding')
  await onboarding.page.locator('h1').waitFor()
  assert.equal(await onboarding.page.locator('h1').count(),1)
  assert.equal(new URL(onboarding.page.url()).pathname,'/onboarding')
  await onboarding.context.close()
  console.log('Standalone onboarding heading and route: PASS')
  // Auth state may update before Login's handler; retain the role-allowed destination.
  const visitor = await setup(null)
  visitor.state.profile.role = 'user'
  const loginJwt = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:actorId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,session_id:'qa-homepage-login'})).toString('base64url'),'synthetic'].join('.')
  await visitor.context.route(env.VITE_SUPABASE_URL+'/auth/v1/token**',route=>route.fulfill({json:{access_token:loginJwt,refresh_token:'qa-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:actorId,email:'actor@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}}}}))
  await visitor.page.goto(base)
  await visitor.page.getByRole('link',{name:'Start a self-check',exact:true}).click()
  await visitor.page.waitForURL('**/login')
  assert.equal(await visitor.page.evaluate(()=>history.state.usr.from),'/onboarding')
  await visitor.page.locator('input[type="email"]').fill('actor@example.invalid')
  await visitor.page.locator('input[type="password"]').fill('Synthetic-password-123')
  await visitor.page.locator('form button[type="submit"]').click()
  await visitor.page.waitForURL('**/onboarding')
  await visitor.page.getByRole('heading',{name:'Your gambling self-check',exact:true}).waitFor()
  assert.equal(await visitor.page.locator('.pgsi-assessment fieldset').count(),9)
  assert.deepEqual(visitor.errors,[])
  await visitor.context.close()
  console.log('Homepage self-check / password login / intended destination: PASS')

} catch(error){failures.push({fatal:error.stack});console.error(error.stack)}
finally{await browser.close();fs.writeFileSync('test-results/workflows.json',JSON.stringify({results,failures},null,2));console.log(`${results.length} route/viewport checks; ${failures.length} findings`)}
if(failures.length)process.exitCode=1