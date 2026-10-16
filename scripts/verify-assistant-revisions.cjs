// UI acceptance against an isolated API. Never contacts OpenRouter.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const CALL='33333333-3333-4333-8333-333333333333', OTHER='44444444-4444-4444-8444-444444444444';
const at='2026-10-12T00:00:00Z';

async function install(page) {
  const chats=[{id:A,title:'Первый чат',mode:'search',created_at:at,updated_at:at},{id:B,title:'Второй чат',mode:'research',created_at:at,updated_at:at}];
  const messages=new Map(chats.map(chat=>[chat.id,[]])), drafts=new Map(), runs=new Map(), created=new Map(), edits=new Map();
  let sequence=0, editCommits=0, loseEdit=true;
  const requests=[], errors=[];
  await page.addInitScript(()=>{window.fixtureCopied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.fixtureCopied=text;}}});});
  page.on('pageerror',error=>errors.push(error.message));
  const user={id:A,email:'qa@example.test',full_name:'Тест',full_surname:'Проверка',username:'@qa',role:'user',created_at:at};
  const finish=(run)=>{
    run.state='completed';run.user_request=null;
    let text='Проверка исследования завершена.';
    const items=[{call_uuid:CALL,title:'Собеседование по Go',chunk_uuid:'chunk-a',quote:'Первая цитата',start_seconds:4,transcription_revision:2,created_at:at},{call_uuid:CALL,title:'Собеседование по Go',chunk_uuid:'chunk-b',quote:'Вторая цитата',start_seconds:70,transcription_revision:2,created_at:at},{call_uuid:OTHER,title:'Работа преподавателя',chunk_uuid:'chunk-c',quote:'Третья цитата',transcription_revision:1,created_at:at}];
    const blocks=run.mode==='search'?[{type:'search_results',data:{items,next_cursor:'next-page',evaluated_calls:3,index_ready_calls:3,warnings:[]}}]:[];
    if(run.mode==='search') text='';
    const current=messages.get(run.chat_uuid);if(!current.some(m=>m.id===run.id+'-answer'))current.push({id:run.id+'-answer',role:'assistant',text,blocks,sources:[],created_at:at,status:'completed'});
    chats.find(c=>c.id===run.chat_uuid).active_run_uuid=undefined;
  };
  const start=(chatId,input)=>{
    const run={id:'run-'+(++sequence),chat_uuid:chatId,mode:input.mode,state:'queued',schema_version:2,progress:{selected_calls:3,checked_calls:0},polls:0,chatQuestion:input.text.includes('спрашивай в чате')};
    runs.set(run.id,run); chats.find(c=>c.id===chatId).active_run_uuid=run.id;
    messages.get(chatId).push({id:run.id+'-user',role:'user',text:input.text,editable:true,blocks:[],sources:[],created_at:at,status:'completed'});
    return run;
  };
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url()),endpoint=url.pathname.replace('/api/v1','');
    const input=['POST','PATCH'].includes(request.method())?request.postDataJSON():{};
    let body={},status=200;
    requests.push({endpoint,method:request.method(),input});
    if(endpoint==='/auth/session') body={access_available:true,refresh_available:true};
    else if(endpoint==='/auth/refresh')body={user};
    else if(endpoint==='/auth/me')body=user;
    else if(endpoint==='/companies'||endpoint.startsWith('/instructions')||endpoint.includes('invitations'))body=[];
    else if(endpoint==='/assistant/capabilities')body={schema_version:2,chat_enabled:true,search_enabled:true,aggregate_enabled:true,export_enabled:true};
    else if(endpoint==='/notifications')body={notifications:[],unread_count:0};
    else if(endpoint==='/assistant/chats'){
      if(request.method()==='POST'){
        const key=input.idempotency_key;if(!created.has(key)){const id='created-'+(++sequence);const chat={id,title:'Новый чат',mode:'search',created_at:at,updated_at:at};created.set(key,chat);chats.unshift(chat);messages.set(id,[]);}body=created.get(key);
      }else body={items:chats};
    }else if(endpoint==='/assistant/draft'){
      const key=(input.company_uuid||url.searchParams.get('company_uuid')||'personal')+'/'+(input.chat_uuid||url.searchParams.get('chat_uuid')||'new');
      const old=drafts.get(key)||{text:'',context:{items:[]},lock_version:0,updated_at:at};
      if(request.method()==='PATCH'){
        // Deliberately delay a save to expose cross-chat races.
        if(input.text==='Черновик первого')await new Promise(resolve=>setTimeout(resolve,350));
        if(input.lock_version!==old.lock_version){status=409;body={error:{message:'draft conflict'}};}
        else{body={text:input.text,context:input.context,lock_version:old.lock_version+1,updated_at:at};drafts.set(key,body);}
      }else body=old;
    }else if(/^\/assistant\/chats\/[^/]+\/mode$/.test(endpoint)){
      const id=endpoint.split('/')[3];chats.find(c=>c.id===id).mode=input.mode;
      for(const run of runs.values())if(run.chat_uuid===id&&run.state==='awaiting_user')run.state='cancelled';
      chats.find(c=>c.id===id).active_run_uuid=undefined;body={mode:input.mode,run:null};
    }else if(/^\/assistant\/chats\/[^/]+\/messages$/.test(endpoint)){
      const id=endpoint.split('/')[3];body=request.method()==='POST'?start(id,input):{items:messages.get(id)||[]};
    }else if(/^\/assistant\/messages\/[^/]+$/.test(endpoint)&&request.method()==='PATCH'){
      const id=endpoint.split('/')[3];
      if(edits.has(input.idempotency_key))body=edits.get(input.idempotency_key);
      else{
        const [chatId,list]=[...messages.entries()].find(([,list])=>list.some(m=>m.id===id));const index=list.findIndex(m=>m.id===id);assert.equal(input.expected_text,list[index].text);
        messages.set(chatId,list.slice(0,index));body=start(chatId,input);edits.set(input.idempotency_key,body);editCommits++;
        if(loseEdit){loseEdit=false;await route.abort('failed');return;}
      }
    }else if(/^\/assistant\/runs\/[^/]+\/answers$/.test(endpoint)){
      const run=runs.get(endpoint.split('/')[3]);
      if(run.chatQuestion)assert(input.chat_text.trim());else assert(input.answers.aspect.trim());finish(run);body=run;
    }else if(/^\/assistant\/runs\/[^/]+$/.test(endpoint)){
      const run=runs.get(endpoint.split('/')[3]);run.polls++;
      if(run.mode==='search')finish(run);
      else if(run.state!=='completed'&&run.state!=='cancelled'){
        run.state='awaiting_user';run.user_request={request_uuid:run.id+'-q',delivery:run.chatQuestion?'chat':'form',kind:'clarification',message:'Уточните, какие аспекты нужно проверить.',calls:[],questions:[{id:'aspect',title:'Какие аспекты прохождения собеседования необходимо проанализировать?',options:['Технические навыки Go: синтаксис, стандартная библиотека, работа с конкурентностью и подробное объяснение решений','Технические навыки, архитектура и системные решения с учётом контекста всех разговоров','Коммуникация, уточнение требований, ход рассуждений и реакция на обратную связь']}]};
        if(run.chatQuestion&&!messages.get(run.chat_uuid).some(m=>m.id===run.id+'-question'))messages.get(run.chat_uuid).push({id:run.id+'-question',role:'assistant',text:'1. Какие аспекты проверить?\n\n1. Технические навыки\n2. Коммуникация\n3. Все аспекты\n4. Свой вариант',blocks:[{type:'user_question'}],sources:[],created_at:at});
      }
      body=run;
    }else if(endpoint==='/calls/content-search')body={items:[{call_uuid:CALL,title:'Собеседование по Go',chunk_uuid:'chunk-d',quote:'Ещё одна цитата',transcription_revision:2,created_at:at}],evaluated_calls:3,index_ready_calls:3,warnings:[]};
    else if(endpoint.endsWith('/new-calls'))body={count:0};
    else if(endpoint.includes('calls')||endpoint.includes('folders')||endpoint.includes('notifications'))body={items:[],total:0,unread_count:0};
    else{status=404;body={error:{message:'Unmocked endpoint: '+endpoint}};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  return {requests,drafts,chats,errors,getEditCommits:()=>editCommits,getCreated:()=>created.size};
}

(async()=>{
 const output=path.resolve(__dirname,'../docs/verification/assistant-revisions');await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 try{
  for(const theme of ['light','dark'])for(const width of [1611,1200,820,390]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:887},reducedMotion:'reduce'});const page=await context.newPage();const mock=await install(page);
   await page.goto('http://localhost:5173/app/calls');if(theme==='dark')await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();
   assert.equal(await page.locator('.vt-theme-glyph[data-active=true]').getAttribute('class'),theme==='light'?'lucide lucide-sun vt-theme-glyph':'lucide lucide-moon vt-theme-glyph');
   await page.getByRole('button',{name:'Поиск и помощник по звонкам',exact:true}).click();
   const composer=page.getByRole('textbox',{name:'Запрос по звонкам'});
   await composer.waitFor();await page.waitForFunction(()=>!document.querySelector('[aria-label="Запрос по звонкам"]').disabled);
   assert.equal(await page.getByRole('button',{name:'Поиск',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:'Размер ответа',exact:true}).count(),0);
   await composer.fill('Единственный новый');
   if(width>650){await page.getByRole('button',{name:'Развернуть',exact:true}).click();}
   else await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('[aria-label="Запрос по звонкам"]').disabled);assert.equal(await composer.inputValue(),'');
   if(width>650){const side=await page.locator('.assistant-history').boundingBox(),main=await page.locator('.assistant-conversation').boundingBox();assert(side.x+side.width<=main.x+1,'history overlaps conversation');}
   await composer.fill('Черновик первого');
   if(width<=650)await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Второй чат',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Запрос по звонкам"]').disabled);assert.equal(await composer.inputValue(),'');
   await composer.fill('Черновик второго');
   if(width<=650)await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Запрос по звонкам"]').disabled);assert.equal(await composer.inputValue(),'Черновик первого');
   await composer.fill('Найди собеседования');await page.getByRole('button',{name:'Отправить запрос',exact:true}).click();
   await page.locator('.assistant-result-call').first().waitFor();assert.equal(await page.locator('.assistant-result-call').count(),2);assert.equal(await page.getByText('Первая цитата',{exact:true}).count(),0);
   await page.getByRole('button',{name:'Ещё звонки',exact:true}).click();assert.equal(await page.locator('.assistant-result-call').count(),2);
   await page.getByRole('button',{name:'Раскрыть звонок: Собеседование по Go',exact:true}).click();await page.getByText('Первая цитата',{exact:true}).waitFor();assert.equal(await page.locator('.assistant-call-matches blockquote').count(),3);
   await page.locator('.assistant-message.user').getByRole('button',{name:'Копировать текст сообщения',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixtureCopied),'Найди собеседования');
   await page.getByRole('button',{name:'Исследование',exact:true}).click();await page.getByRole('button',{name:'Размер ответа',exact:true}).waitFor();
   await composer.fill('Проанализируй прохождение собеседования');await page.getByRole('button',{name:'Отправить запрос',exact:true}).click();await page.locator('.assistant-questions').waitFor();
   assert.equal(await page.getByRole('button',{name:'Отменить',exact:true}).count(),0);assert.equal(await page.getByText('awaiting_user',{exact:true}).count(),0);
   for(const option of await page.locator('.assistant-answer-option').all()){
    const box=await option.boundingBox(),caption=await option.locator('span').last().boundingBox(),radio=await option.locator('input').boundingBox();assert(radio.width<=20);assert(caption.x+caption.width<=box.x+box.width+1,'answer text overflows');
   }
   await page.screenshot({path:path.join(output,`questions-${width}-${theme}.png`),fullPage:true});
   await page.getByRole('radio').first().check();await page.getByRole('button',{name:'Ответить и продолжить',exact:true}).click();await page.getByText('Проверка исследования завершена.',{exact:true}).waitFor();
   await page.locator('.assistant-message.user').first().getByRole('button',{name:'Редактировать сообщение',exact:true}).click();await page.getByRole('textbox',{name:'Текст сообщения',exact:true}).fill('Проанализируй исправленный запрос');
   await page.getByRole('button',{name:'Сохранить и отправить',exact:true}).click();await page.locator('.assistant-error').waitFor();await page.getByRole('button',{name:'Сохранить и отправить',exact:true}).click();await page.locator('.assistant-questions').waitFor();assert.equal(mock.getEditCommits(),1);
   assert.equal(await page.locator('.assistant-message.user').count(),1);assert.equal(await page.getByText('Найди собеседования',{exact:true}).count(),0);
   await page.getByRole('button',{name:'Поиск',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Отправить запрос"]'));
   await composer.fill('Найди другие звонки');assert.equal(await page.getByRole('button',{name:'Отправить запрос',exact:true}).isEnabled(),true);
   if(width===1611||width===390){
    await page.getByRole('button',{name:'Исследование',exact:true}).click();
    await composer.fill('Проанализируй ответы, спрашивай в чате');await page.getByRole('button',{name:'Отправить запрос',exact:true}).click();
    await page.getByText('Какие аспекты проверить?',{exact:false}).waitFor();
    await composer.fill('1. 3');assert.equal(await page.getByRole('button',{name:'Отправить запрос',exact:true}).isEnabled(),true);await page.getByRole('button',{name:'Отправить запрос',exact:true}).click();
    await page.getByText('Проверка исследования завершена.',{exact:true}).waitFor();
   }
   // New chat is a single placeholder; no server row is created by pressing +.
   if(width<=650)await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.locator('.assistant-history').getByRole('button',{name:'Новый чат',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Запрос по звонкам"]').disabled);assert.equal(await composer.inputValue(),'Единственный новый');assert.equal(mock.getCreated(),0);
   if(width<=650)await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.locator('.assistant-history').getByRole('button',{name:'Новый чат',exact:true}).click();assert.equal(await composer.inputValue(),'Единственный новый');
   assert.equal(await page.getByText('Сохранение черновика…',{exact:false}).count(),0);
   assert.deepEqual(mock.errors,[]);await context.close();console.log(`PASS ${width} ${theme}`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
