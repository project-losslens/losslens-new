import { chromium } from 'playwright-core'
const EXE='C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe'
const BASE='https://kepsxjmolzurvdnxgcby.supabase.co'
const TAG=process.argv[2]||'after'
const browser=await chromium.launch({headless:true,executablePath:EXE})
async function newPage(width){
  const page=await browser.newPage({viewport:{width,height:800}})
  const user={id:'u1',aud:'authenticated',role:'user',username:'qatester',full_name:'QA Tester'}
  const session=()=>({access_token:'fake.jwt.token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'rt',user:{...user,role:'authenticated',aud:'authenticated',email:'qa@test.dev',created_at:new Date().toISOString()}})
  await page.route('**/*',async route=>{
    const u=route.request().url()
    if(!u.startsWith(BASE))return route.continue()
    const json=(o)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)})
    if(u.includes('/auth/v1/token'))return json(session())
    if(u.includes('/auth/v1/user'))return json(user)
    if(u.includes('/auth/v1/logout'))return json({})
    if(u.includes('/rest/v1/profiles')){const p={...user,id:'u1',role:'user'};return json((route.request().headers()['accept']||'').includes('vnd.pgrst.object')?p:[p])}
    if(u.includes('/rest/v1/'))return json([])
    return json({})
  })
  return page
}
async function login(page){
  await page.goto('http://127.0.0.1:5173/login',{waitUntil:'networkidle'}).catch(()=>{})
  await page.waitForTimeout(600)
  await page.locator('input[type="email"]').first().fill('qa@test.dev')
  await page.locator('input[type="password"]').first().fill('password123')
  const b=page.locator('button[type="submit"],button:has-text("Sign in")').first();if(await b.count())await b.click()
  await page.waitForTimeout(2800)
}
async function shot(page,path,name,scrollY=0){
  await page.goto('http://127.0.0.1:5173'+path,{waitUntil:'networkidle'}).catch(()=>{})
  await page.waitForTimeout(1400)
  if(scrollY)await page.evaluate(y=>scrollTo(0,y),scrollY)
  await page.waitForTimeout(400)
  await page.screenshot({path:`shots/${TAG}-${name}.png`})
  console.log(TAG,name,'ok')
}
for(const w of [1440,390]){
  const pub=await newPage(w)
  await shot(pub,'/','home',0)
  await shot(pub,'/dashboard','dash-need-auth')
  await pub.close()
  const page=await newPage(w)
  await login(page)
  await shot(page,'/dashboard','dashboard',0)
  await shot(page,'/dashboard','dashboard-scrolled',700)
  await shot(page,'/diary','diary',0)
  await page.close()
}
await browser.close()
