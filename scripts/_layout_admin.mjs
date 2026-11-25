import { chromium } from 'playwright-core'
const EXE='C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe'
const BASE='https://kepsxjmolzurvdnxgcby.supabase.co'
const browser=await chromium.launch({headless:true,executablePath:EXE})
const page=await browser.newPage({viewport:{width:1440,height:800}})
await page.route('**/*',async route=>{
  const u=route.request().url()
  if(!u.startsWith(BASE))return route.continue()
  const json=(o)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)})
  const user={id:'u1',role:'authenticated',aud:'authenticated',email:'qa@test.dev',created_at:new Date().toISOString()}
  if(u.includes('/auth/v1/token'))return json({access_token:'t',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'rt',user})
  if(u.includes('/auth/v1/user'))return json(user)
  if(u.includes('/auth/v1/logout'))return json({})
  if(u.includes('/rest/v1/profiles')){const p={id:'u1',role:'super_admin',username:'qa',full_name:'QA'};return json((route.request().headers()['accept']||'').includes('vnd.pgrst.object')?p:[p])}
  if(u.includes('/rest/v1/'))return json([])
  return json({})
})
await page.goto('http://127.0.0.1:5173/login',{waitUntil:'networkidle'}).catch(()=>{})
await page.waitForTimeout(600)
await page.locator('input[type="email"]').first().fill('qa@test.dev')
await page.locator('input[type="password"]').first().fill('password123')
const b=page.locator('button[type="submit"],button:has-text("Sign in")').first();if(await b.count())await b.click()
await page.waitForTimeout(3000)
for(const p of ['/super-admin/users','/admin']){
  await page.goto('http://127.0.0.1:5173'+p,{waitUntil:'networkidle'}).catch(()=>{})
  await page.waitForTimeout(1500)
  const r=await page.evaluate(()=>{const de=document.documentElement;const c=document.querySelector('.page-content,.portal-page,main');const b=c?c.getBoundingClientRect():null;return{url:location.pathname,hScroll:de.scrollWidth>de.clientWidth+1,w:b?Math.round(b.width):null,l:b?Math.round(b.left):null}})
  console.log(JSON.stringify(r))
  await page.screenshot({path:`shots/after-${p.replace(/\//g,'_')}.png`})
}
await browser.close()
