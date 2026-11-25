import { chromium } from 'playwright-core'
const EXE='C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe'
const BASE='https://kepsxjmolzurvdnxgcby.supabase.co'
const browser=await chromium.launch({headless:true,executablePath:EXE})
async function shot(width,path,name,auth){
  const page=await browser.newPage({viewport:{width,height:800}})
  if(auth){
    const user={id:'u1',aud:'authenticated',role:'authenticated',email:'qa@test.dev',created_at:new Date().toISOString()}
    const session=()=>({access_token:'fake.jwt.token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'rt',user})
    await page.route('**/*',async route=>{
      const u=route.request().url()
      if(!u.startsWith(BASE))return route.continue()
      const json=(o)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)})
      if(u.includes('/auth/v1/token'))return json(session())
      if(u.includes('/auth/v1/user'))return json(user)
      if(u.includes('/auth/v1/logout'))return json({})
      if(u.includes('/rest/v1/profiles')){const p={id:'u1',role:'user',username:'qatester',full_name:'QA Tester'};return json((route.request().headers()['accept']||'').includes('vnd.pgrst.object')?p:[p])}
      if(u.includes('/rest/v1/'))return json([])
      return json({})
    })
    await page.goto('http://127.0.0.1:5173/login',{waitUntil:'networkidle'}).catch(()=>{})
    await page.waitForTimeout(700)
    await page.locator('input[type="email"]').first().fill('qa@test.dev')
    await page.locator('input[type="password"]').first().fill('password123')
    const b=page.locator('button[type="submit"],button:has-text("Sign in")').first();if(await b.count())await b.click()
    await page.waitForTimeout(3000)
  }
  await page.goto('http://127.0.0.1:5173'+path,{waitUntil:'networkidle'}).catch(()=>{})
  await page.waitForTimeout(1500)
  await page.screenshot({path:`shots/${name}.png`})
  console.log('saved shots/'+name+'.png', await page.evaluate(()=>location.pathname))
  await page.close()
}
await shot(1280,'/','home-desktop',false)
await shot(360,'/','home-mobile',false)
await shot(1280,'/dashboard','dashboard-desktop',true)
await shot(360,'/dashboard','dashboard-mobile',true)
await shot(1280,'/onboarding','onboarding-desktop',true)
await browser.close()
