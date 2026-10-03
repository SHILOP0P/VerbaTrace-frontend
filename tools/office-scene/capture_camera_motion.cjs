// Real browser motion review. Run separately from performance measurements.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.OFFICE_QA_ORIGIN||'http://127.0.0.1:5173';
const out='docs/scene-upgrade/generated/qa/motion';fs.mkdirSync(out,{recursive:true});
const names={hero:'Офис',employee:'Рабочее место сотрудника',leader:'Кабинет руководителя отдела',deputy:'Рабочее место заместителя',owner:'Кабинет владельца'};
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const start=Date.now();
 const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:'.cache/camera-video',size:{width:1280,height:800}}});
 const page=await context.newPage();const video=page.video();const report={origin,frames:[],note:'All 20 ordered pairs, including the adjacent story and its exact rewind; recording is separate from frame-time QA.',assetHash:require('node:crypto').createHash('sha256').update(fs.readFileSync('public/assets/scene/office.glb')).digest('hex')};
 await page.goto(origin+'/?sceneQA=1');await page.waitForFunction(()=>window.__officeDiagnostics?.ready,null,{timeout:60000});await page.waitForTimeout(500);
 if(await page.locator('html').getAttribute('data-theme')!=='light')await page.locator('.theme-toggle').click();
 const warmedSeconds=(Date.now()-start)/1000;let from='hero';
 for(const to of ['employee','leader','deputy','owner','deputy','leader','employee','hero', 'leader','owner','leader','hero','deputy','hero','employee','deputy','employee','owner','employee','hero','owner','hero']){
  await page.getByRole('button',{name:names[to],exact:true}).click();
  for(const phase of [.22,.5,.78,1]){
   await page.waitForFunction(({to,phase})=>{const f=window.__officeDiagnostics?.frames.at(-1);return f?.shot===to&&f.progress>=phase},{to,phase},{timeout:15000});
   if(phase===1&&to!=='hero')await page.waitForFunction(()=>{const live=document.querySelector('.scene-screen-layer[data-live="1"]');return live&&+getComputedStyle(live).opacity>.95},null,{timeout:5000});
   const frame=await page.evaluate(()=>window.__officeDiagnostics.frames.at(-1));
   const file=`${from}-${to}-${Math.round(phase*100)}.png`;await page.screenshot({path:path.join(out,file)});
   report.frames.push({from,to,phase:frame.progress,position:frame.camera,direction:frame.direction,fov:frame.fov,file});
  }await page.waitForTimeout(250);from=to;
 }await page.waitForTimeout(500);const raw=await video.path();await context.close();
 const ffmpeg='C:/Users/muxa4/AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe';
 const final=path.join(out,'camera-motion.webm');
 if(fs.existsSync(ffmpeg)){
  const r=cp.spawnSync(ffmpeg,['-y','-ss',warmedSeconds.toFixed(3),'-i',raw,'-c','copy',final],{stdio:'ignore'});
  if(r.status!==0)throw Error('Cannot trim review video');
 }else fs.copyFileSync(raw,final);
 report.video='camera-motion.webm';report.warmupTrimmed=fs.existsSync(ffmpeg);report.recorded=new Date().toISOString();
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({frames:report.frames.length,video:final,bytes:fs.statSync(final).size}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
