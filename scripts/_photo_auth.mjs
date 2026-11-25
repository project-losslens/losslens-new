import { chromium } from 'playwright-core'
const EXE='C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe'
const BASE='https://kepsxjmolzurvdnxgcby.supabase.co'
const ROLE=process.argv[2]||'user'
const WIDTH=+(process.argv[3]||1280)
const user={id:'u1',aud:'authenticated',role:'authenticated',email:'qa@test.dev',created_at:new Date().toISOString()}
const session=()=>({access_token:'fake.jwt.token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'rt',user})
const browser=await chromium.launch({headless:true,executablePath:EXE})
const page=await browser.newPage({viewport:{width:WIDTH,height:800}})
await page.route('**/*',async route=>{
  const u=route.request().url()
  if(!u.startsWith(BASE))return route.continue()
  const json=(o,st=200)=>route.fulfill({status:st,contentType:'application/json',body:JSON.stringify(o)})
  if(u.includes('/auth/v1/token'))return json(session())
  if(u.includes('/auth/v1/user'))return json(user)
  if(u.includes('/auth/v1/logout'))return json({})
  if(u.includes('/rest/v1/profiles')){
    const prof={id:'u1',role:ROLE,username:'qatester',full_name:'QA Tester',created_at:new Date().toISOString()}
    const single=(route.request().headers()['accept']||'').includes('vnd.pgrst.object')
    return json(single?prof:[prof])
  }
  if(u.includes('/rest/v1/'))return json([])
  if(u.includes('/auth/v1/'))return json({})
  return json({})
})
await page.goto('http://127.0.0.1:5173/login',{waitUntil:'networkidle'}).catch(()=>{})
await page.waitForTimeout(800)
await page.locator('input[type="email"]').first().fill('qa@test.dev')
await page.locator('input[type="password"]').first().fill('password123')
const btn=page.locator('button[type="submit"], button:has-text("Sign in")').first()
if(await btn.count())await btn.click()
await page.waitForTimeout(3500)
const check=async(path,extra)=>{
  await page.goto('http://127.0.0.1:5173'+path,{waitUntil:'networkidle'}).catch(()=>{})
  await page.waitForTimeout(1500)
  if(extra==='chat'){const fab=page.locator('button[aria-label*="chat" i],button[aria-label*="Oloo" i],.oloo-fab,button:has-text("Oloo")').first();if(await fab.count()){await fab.click().catch(()=>{});await page.waitForTimeout(800)}}
  const r=await page.evaluate(()=>{
    const has=(el)=>{if(!el)return null;const b=getComputedStyle(el).backgroundImage;return b.includes('uhuru-park')?'PHOTO':(b==='none'?'none':'other')}
    const qs=(s)=>document.querySelector(s)
    return {url:location.pathname,
      bodyLayer:getComputedStyle(document.body,'::before').backgroundImage.includes('uhuru-park')?'PHOTO':'none',
      shellHeader:has(qs('.shell__header')), pageToolbar:has(qs('.page-toolbar')),
      chatHeader:has(qs('.oloo-chat-header')),
      topEl:(()=>{const e=document.elementFromPoint(innerWidth/2,innerHeight*0.3);return e?e.tagName+'.'+String(e.className).slice(0,45):'none'})()}
  })
  console.log(WIDTH,ROLE,path,JSON.stringify(r))
}
const routes=ROLE==='admin'?['/admin','/admin/crisis']:ROLE==='therapist'?['/therapist','/therapist/claims']:ROLE==='insurer'?['/insurer','/insurer/claims']:['/dashboard','/diary','/support']
for(const p of routes)await check(p)
await check(ROLE==='user'?'/dashboard':'/'+ROLE,'chat')
await browser.close()
