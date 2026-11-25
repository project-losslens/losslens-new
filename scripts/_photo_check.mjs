import { chromium } from 'playwright-core'
const EXE='C:/Users/ADMIN/AppData/Local/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-win64/chrome-headless-shell.exe'
const browser=await chromium.launch({headless:true,executablePath:EXE})
const photo='uhuru-park'
async function probe(width,path){
  const page=await browser.newPage({viewport:{width,height:800}})
  await page.goto('http://127.0.0.1:5173'+path,{waitUntil:'networkidle'}).catch(()=>{})
  await page.waitForTimeout(1200)
  const r=await page.evaluate((photo)=>{
    const has=(el)=>{if(!el)return null;const b=getComputedStyle(el).backgroundImage;return b.includes(photo)?'PHOTO':(b==='none'?'none':b.slice(0,60))}
    const qs=(s)=>document.querySelector(s)
    const bodyBefore=getComputedStyle(document.body,'::before').backgroundImage
    return {
      url:location.pathname,
      bodyLayer:bodyBefore.includes(photo)?'PHOTO':bodyBefore.slice(0,50),
      shellHeader:has(qs('.shell__header')),
      llHeader:has(qs('.ll-header')),
      heroType:has(qs('.hp-hero__type')),
      chatHeader:has(qs('.oloo-chat-header')),
      firstViewportPhoto: (()=>{const el=document.elementFromPoint(innerWidth/2, innerHeight*0.25);return el?el.tagName+'.'+String(el.className).slice(0,50):'none'})()
    }
  },photo)
  console.log(width,path,JSON.stringify(r))
  await page.close()
}
for(const w of [1280,360]){
  for(const p of ['/','/pricing','/login','/signup','/protection']) await probe(w,p)
}
await browser.close()
