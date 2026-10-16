// Isolated browser/API checks. No requests reach any AI provider.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'verify-assistant-revisions.cjs'),'utf8');
const install=new Function('require',source.slice(0,source.indexOf('(async()=>{'))+'\nreturn install;')(require);
const A='11111111-1111-4111-8111-111111111111',at='2026-10-13T00:00:00Z';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const output=path.resolve(__dirname,'../docs/verification/assistant-pause');fs.mkdirSync(output,{recursive:true});
 try{for(const width of [1611,820,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:width===390?844:987},reducedMotion:'reduce'}),page=await context.newPage();const mock=await install(page);
  const run={id:'pause-run',chat_uuid:A,mode:'research',state:'processing',request_received_at:at,progress:{selected_calls:21,checked_calls:11}};
  let pauses=0,resumes=0,pausedReads=0;
  await page.route(/\/api\/v1\/assistant\/chats(?:\?|$)/,route=>route.fulfill({json:{items:[{id:A,title:'Первый чат',mode:'research',active_run_uuid:run.id,created_at:at}]}}));
  await page.route('**/api/v1/assistant/runs/pause-run/pause',route=>{pauses++;run.pause_requested=true;return route.fulfill({json:run});});
  await page.route('**/api/v1/assistant/runs/pause-run/resume',route=>{resumes++;run.pause_requested=false;run.state='processing';run.error_code=undefined;return route.fulfill({json:run});});
  await page.route(/\/api\/v1\/assistant\/runs\/pause-run(?:\?|$)/,route=>{
   if(run.pause_requested&&++pausedReads>=2){run.state='paused';run.error_code='user_paused';}
   return route.fulfill({json:run});
  });
  await page.goto('http://localhost:5173/app/calls');if(theme==='dark')await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();
  await page.getByRole('button',{name:'Поиск и помощник по звонкам',exact:true}).click();if(width>650)await page.getByRole('button',{name:'Развернуть',exact:true}).click();if(await page.locator('.assistant-history').getAttribute('aria-hidden')==='true')await page.getByRole('button',{name:'История чатов',exact:true}).click();
  await page.getByRole('button',{name:'Первый чат',exact:true}).click();
  const pause=page.getByRole('button',{name:'Приостановить исследование',exact:true});await pause.waitFor();assert(await pause.isEnabled(),'blank composer must still offer pause');assert.equal(await page.getByRole('button',{name:'Отправить запрос',exact:true}).count(),0);
  await pause.click();const waiting=page.getByRole('button',{name:'Приостанавливаю исследование',exact:true});await waiting.waitFor();assert.equal(await waiting.isEnabled(),false);assert.equal(pauses,1);
  await page.getByText('Исследование на паузе. Выполненные проверки сохранены; можно продолжить с этого места.',{exact:true}).waitFor();assert.equal(resumes,0,'no automatic continuation');
  await page.getByRole('button',{name:'Отправить запрос',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,`paused-${width}-${theme}.png`)});
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();await pause.waitFor();assert.equal(resumes,1);assert.equal(pauses,1);assert.deepEqual(mock.errors,[]);
  await context.close();console.log('PASS pause',width,theme);
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
