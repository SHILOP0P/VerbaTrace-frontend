// Native screenshots of the same portrait documents used by the live monitors.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const origin=process.env.OFFICE_QA_ORIGIN || 'http://127.0.0.1:5173';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const landing=await browser.newPage({viewport:{width:390,height:844}});
 await landing.goto(origin+'/?sceneQA=1');
 await landing.waitForFunction(()=>window.__officeDiagnostics?.ready&&document.querySelectorAll('.scene-screen-frame').length===4,null,{timeout:60000});
 const sizes=await landing.locator('.scene-screen-frame').evaluateAll(frames=>frames.map(f=>({role:new URL(f.src).searchParams.get('role'),width:Number(f.width),height:Number(f.height)})));
 await landing.close();
 const report=[];
 for(const size of sizes)for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:size.width,height:size.height}});
  await page.goto(`${origin}/demo.html?role=${size.role}&theme=${theme}&monitor=portrait`);
  await page.waitForFunction(()=>document.querySelector('#root')?.textContent.includes('VerbaTrace'),null,{timeout:30000});
  await page.evaluate(async theme=>{document.documentElement.dataset.theme=theme;await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))},theme);
  await page.waitForTimeout(200);
  const file=`public/assets/scene/screens/${size.role}-portrait-${theme}.jpg`;
  await page.screenshot({path:file,type:'jpeg',quality:82});
  report.push({...size,theme,file,bytes:fs.statSync(file).size});
  await page.close();
 }
 fs.writeFileSync('docs/scene-upgrade/generated/qa/portrait-screens.json',JSON.stringify({origin,recorded:new Date().toISOString(),screens:report},null,2));
 console.log(JSON.stringify(report));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
