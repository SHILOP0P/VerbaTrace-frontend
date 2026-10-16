// Optional clarification checks with a fully isolated API; no AI spending.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'verify-assistant-revisions.cjs'),'utf8');
const install=new Function('require',source.slice(0,source.indexOf('(async()=>{'))+'\nreturn install;')(require);
const A='11111111-1111-4111-8111-111111111111',at='2026-10-13T00:00:00Z';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 try{for(const width of [1611,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'}),page=await context.newPage();const mock=await install(page);let answers=0;
  const run={id:'autonomy-run',chat_uuid:A,mode:'research',state:'awaiting_user',request_received_at:at,user_request:{request_uuid:'autonomy-question',delivery:'form',kind:'clarification',message:'Уточните предпочтения.',calls:[],questions:[{id:'aspect',title:'Что разобрать?',options:['Технические ответы','Коммуникацию']},{id:'format',title:'Как представить?',options:['Кратко','Подробно']}]}};
  await page.route(/\/api\/v1\/assistant\/chats(?:\?|$)/,route=>route.fulfill({json:{items:[{id:A,title:'Первый чат',mode:'research',active_run_uuid:run.id,created_at:at}]}}));
  await page.route(/\/api\/v1\/assistant\/runs\/autonomy-run(?:\?|$)/,route=>route.fulfill({json:run}));
  await page.route('**/api/v1/assistant/runs/autonomy-run/answers',route=>{
   const input=route.request().postDataJSON();assert.equal(input.answers.aspect,'Технические ответы');assert(input.answers.format.startsWith('Продолжи самостоятельно'));assert(input.idempotency_key.endsWith(':autonomous'));answers++;run.state='processing';run.user_request=null;return route.fulfill({json:run});
  });
  await page.goto('http://localhost:5173/app/calls');if(theme==='dark')await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();
  await page.getByRole('button',{name:'Поиск и помощник по звонкам',exact:true}).click();if(width>650)await page.getByRole('button',{name:'Развернуть',exact:true}).click();else await page.getByRole('button',{name:'История чатов',exact:true}).click();await page.getByRole('button',{name:'Первый чат',exact:true}).click();
  const form=page.locator('.assistant-questions');await form.waitFor();await form.getByRole('radio',{name:/Технические ответы/}).check();assert.equal(answers,0,'delegation requires an explicit user action');
  await form.getByRole('button',{name:'Продолжить самостоятельно',exact:true}).click();await form.waitFor({state:'detached'});await page.getByRole('button',{name:'Приостановить исследование',exact:true}).waitFor();assert.equal(answers,1);assert.deepEqual(mock.errors,[]);await context.close();console.log('PASS optional clarification',width,theme);
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
