// Blocked-material UI acceptance. Every API is mocked; no provider calls.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'verify-assistant-revisions.cjs'),'utf8');
const install=new Function('require',source.slice(0,source.indexOf('(async()=>{'))+'\nreturn install;')(require);
const A='11111111-1111-4111-8111-111111111111',CALL='33333333-3333-4333-8333-333333333333',NIL='00000000-0000-0000-0000-000000000000';
const reason='Это старые записи без завершённой защиты персональных данных. Их расшифровки пока нельзя использовать в исследовании ИИ.';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const output=path.resolve(__dirname,'../docs/verification/assistant-material-problems');fs.mkdirSync(output,{recursive:true});
 try{
  for(const theme of ['light','dark'])for(const width of [1786,820,390]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:987},reducedMotion:'reduce'}),page=await context.newPage();const mock=await install(page);let decisions=[];
   const calls=Array.from({length:17},(_,index)=>({call_uuid:index===0?CALL:'44444444-4444-4444-8444-'+String(index).padStart(12,'0'),title:'Собеседование '+(index+1),reason,reason_code:'privacy_legacy'}));
   calls.push({call_uuid:NIL,title:'',reason:'Запись удалена или у вас больше нет доступа к ней.',reason_code:'access_lost'});
   calls.push({...calls.at(-1)});
   const run={id:'run-problems',chat_uuid:A,mode:'research',state:'awaiting_user',progress:{selected_calls:40,checked_calls:0},user_request:{request_uuid:'blocked-'+theme+width,kind:'exclusion',delivery:'form',remaining_calls:21,message:'Исследование остановлено: пока нельзя проверить 19 из 40 выбранных записей. Причины и названия указаны ниже. Исключить эти записи и продолжить по остальным (21)? Они не будут учитываться в выводах.',questions:[],calls}};
   await page.route(/\/api\/v1\/assistant\/chats(?:\?|$)/,async route=>{if(route.request().method()!=='GET')return route.fallback();await route.fulfill({json:{items:[{id:A,title:'Первый чат',mode:'research',active_run_uuid:run.id}]}});});
   await page.route(/\/api\/v1\/assistant\/runs\/run-problems(?:\?|$)/,route=>route.fulfill({json:run}));
   await page.route('**/api/v1/assistant/runs/run-problems/answers',route=>{const body=route.request().postDataJSON();decisions.push(body.accept);run.state=body.accept?'queued':'paused';run.user_request=null;return route.fulfill({json:run});});
   await page.goto('http://localhost:5173/app/calls');if(theme==='dark')await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();
   await page.getByRole('button',{name:'Поиск и помощник по звонкам',exact:true}).click();
   if(width>650)await page.getByRole('button',{name:'Развернуть',exact:true}).click();else await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();const form=page.locator('.assistant-questions');await form.waitFor();
   assert.equal(await page.getByText(reason,{exact:true}).count(),1,'reason must not repeat for every call');
   assert.equal(await form.locator('.assistant-problem-group').count(),2);assert.equal(await form.locator('li').count(),17);assert.equal(await page.getByText('Недоступный материал',{exact:true}).count(),0);
   await page.getByText('Записей без доступа: 2. Названия скрыты.',{exact:true}).waitFor();assert.deepEqual(decisions,[],'no silent exclusion');
   const labels=await form.locator('.assistant-problem-group li>button').all();assert.equal(labels.length,17);
   for(const label of labels){const box=await label.boundingBox(),text=await label.locator('span').boundingBox();assert(text.x+text.width<=box.x+box.width+1,'title overflows');}
   await page.screenshot({path:path.join(output,`blocked-${width}-${theme}.png`)});
   await page.getByRole('button',{name:'Оставить на паузе',exact:true}).click();await form.waitFor({state:'detached'});assert.deepEqual(decisions,[false]);
   // When all records are blocked, continuing on an empty set is not offered.
   run.state='awaiting_user';run.user_request={request_uuid:'all-blocked-'+theme+width,kind:'exclusion',delivery:'form',remaining_calls:0,message:'Исследование остановлено: все выбранные записи (17) пока нельзя проверить.',questions:[],calls:calls.slice(0,17)};
   await page.reload();await page.getByRole('button',{name:'Поиск и помощник по звонкам',exact:true}).click();
   if(width>650)await page.getByRole('button',{name:'Развернуть',exact:true}).click();else await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();await form.waitFor();
   assert.equal(await page.getByRole('button',{name:'Исключить и продолжить',exact:true}).count(),0);await page.getByRole('button',{name:'Оставить на паузе',exact:true}).waitFor();
   assert.deepEqual(mock.errors,[]);await context.close();console.log('PASS',theme,width);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
