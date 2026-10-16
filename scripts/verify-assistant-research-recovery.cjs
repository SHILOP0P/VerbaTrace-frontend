// Resume/status acceptance uses an isolated API. No provider requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'verify-assistant-revisions.cjs'),'utf8');
const install=new Function('require',source.slice(0,source.indexOf('(async()=>{'))+'\nreturn install;')(require);
const A='11111111-1111-4111-8111-111111111111',at='2026-10-12T00:00:00Z';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const output=path.resolve(__dirname,'../docs/verification/assistant-research-recovery');fs.mkdirSync(output,{recursive:true});
 try{
  for(const terminal of ['failed','completed','paused'])for(const width of [1611,390])for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width,height:width===390?844:987},reducedMotion:'reduce'}),page=await context.newPage();const mock=await install(page);let phase='initial',reads=0,polls=0,answers=0;
   const run={id:'run-recovery',chat_uuid:A,mode:'research',state:'awaiting_user',request_received_at:at,progress:{selected_calls:21,checked_calls:0},user_request:{request_uuid:'question-recovery',kind:'clarification',delivery:'form',message:'Какие аспекты проверить?',questions:[{id:'aspect',title:'Какие аспекты?',options:['Технические навыки','Коммуникация']}],calls:[]}};
   await page.route(/\/api\/v1\/assistant\/chats(?:\?|$)/,route=>route.fulfill({json:{items:[{id:A,title:'Первый чат',mode:'research',active_run_uuid:run.id,created_at:at}]}}));
   await page.route('**/api/v1/assistant/runs/run-recovery/answers',route=>{
    answers++;assert.equal(route.request().postDataJSON().answers.aspect,'Технические навыки');phase='polling';run.user_request=null;run.state='queued';return route.fulfill({json:run});
   });
   await page.route(/\/api\/v1\/assistant\/runs\/run-recovery(?:\?|$)/,async route=>{
    reads++;
    if(phase==='initial'&&reads===1)return route.fulfill({status:503,json:{error:{message:'Temporary status outage'}}});
    if(phase==='polling'){
     polls++;
     if(polls===1)return route.fulfill({status:503,json:{error:{message:'Temporary status outage'}}});
     if(polls===2){run.state='processing';run.progress={selected_calls:21,checked_calls:1,total_parts:9,checked_parts:7};}
     else{
      phase='finished';run.state=terminal;run.error_code=terminal==='failed'?'source_evidence_invalid':terminal==='paused'?'provider_budget_exceeded':undefined;
      if(terminal==='completed')run.assistant_message={id:'final-message',role:'assistant',text:'Проверены все 21 записи. Итоговое исследование завершено.',created_at:at,blocks:[],sources:[],status:'completed'};
     }
    }
    return route.fulfill({json:run});
   });
   await page.route('**/api/v1/assistant/chats/'+A+'/messages',route=>{
    if(phase==='finished'&&terminal==='completed')return route.fulfill({status:503,json:{error:{message:'Temporary history outage'}}});
    return route.fulfill({json:{items:[{id:'user-message',role:'user',text:'Проанализируй прохождение собеседования',created_at:at,blocks:[],sources:[]}]}});
   });
   await page.goto('http://localhost:5173/app/calls');if(theme==='dark')await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();
   await page.getByRole('button',{name:'Поиск и помощник по звонкам',exact:true}).click();if(width>650)await page.getByRole('button',{name:'Развернуть',exact:true}).click();else await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();
   await page.getByText('Связь с сервером прервана. Обновление статуса повторится автоматически.',{exact:true}).waitFor();
   const form=page.locator('.assistant-questions');await form.waitFor();assert(reads>=2,'initial failed read must recover');
   await form.getByRole('radio').first().check();
   if(width<=650)await page.getByRole('button',{name:'История чатов',exact:true}).click();await page.getByRole('button',{name:'Первый чат',exact:true}).click();assert.equal(await form.locator('input:checked').count(),1,'reselecting current chat must retain its form');
   await page.getByRole('button',{name:'Ответить и продолжить',exact:true}).click();await form.waitFor({state:'detached'});
   await page.getByText('Связь с сервером прервана. Обновление статуса повторится автоматически.',{exact:true}).waitFor();
   await page.getByText('Изучаю записи · Проверено 1 из 21 · Часть материала 8 из 9',{exact:true}).waitFor();assert.equal(await page.getByText('Проверены все 21 записи. Итоговое исследование завершено.',{exact:true}).count(),0);
   if(terminal==='failed')await page.getByText(/Исследование остановлено: ИИ сослался на неподтверждённую цитату/).waitFor();
   else if(terminal==='paused') {
    const notice=page.getByText('Исследование приостановлено на установленном лимите расходов. Проверенные этапы сохранены.',{exact:true});
    await notice.waitFor();assert.equal(await notice.count(),1,'one reason for the pause, without repeated notices');
    assert.equal(await page.locator('.assistant-processing-mark.is-waiting').count(),1);
   } else await page.getByText('Проверены все 21 записи. Итоговое исследование завершено.',{exact:true}).waitFor();
   assert.equal(await page.locator('.assistant-processing-mark:not(.is-waiting)').count(),0,'finished or paused run must not keep spinning');assert.equal(answers,1);assert.equal(mock.requests.filter(item=>item.endpoint.includes('/resume')).length,0,'status recovery must not initiate a paid retry');
   await page.screenshot({path:path.join(output,`${terminal}-${width}-${theme}.png`)});assert.deepEqual(mock.errors,[]);await context.close();console.log('PASS',terminal,width,theme);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
