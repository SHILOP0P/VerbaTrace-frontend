// Nine-question acceptance with an isolated API; no provider requests.
const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'verify-assistant-revisions.cjs'),'utf8');
const install=new Function('require',source.slice(0,source.indexOf('(async()=>{'))+'\nreturn install;')(require);
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const questions=Array.from({length:9},(_,i)=>({id:'q'+(i+1),title:i===3?'Как группировать результаты?':i===5?'Какие графики нужны?':'Вопрос '+(i+1)+' о требованиях к анализу собеседований',options:i===3?['none — без группировок','employee — по участникам']:i===5?['Гистограммы/бар-чарты','Таймлайн ключевых событий в интервью']:['Технические навыки Go, архитектура сервисов и объяснение решений с подробными примерами из собеседований','Общие выводы (high-level)']}));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
 const output=path.resolve(__dirname,'../docs/verification/assistant-form');fs.mkdirSync(output,{recursive:true});
 try{
  for(const theme of ['light','dark'])for(const width of [1611,820,390]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
   const mock=await install(page);let posted=[],attempts=0;
   const run={id:'run-form',chat_uuid:A,mode:'research',state:'awaiting_user',progress:{selected_calls:38,checked_calls:0},user_request:{request_uuid:'form-nine-'+theme+width,kind:'clarification',delivery:'form',message:'Уточним необходимые требования к анализу.',calls:[],questions}};
   await page.route(/\/api\/v1\/assistant\/chats(?:\?|$)/,async route=>{
    if(route.request().method()!=='GET')return route.fallback();
    await route.fulfill({json:{items:[{id:A,title:'Первый чат',mode:'research',active_run_uuid:run.id},{id:B,title:'Второй чат',mode:'research'}]}});
   });
   await page.route(/\/api\/v1\/assistant\/runs\/run-form(?:\?|$)/,route=>route.fulfill({json:run}));
   await page.route('**/api/v1/assistant/runs/run-form/answers',async route=>{
    const body=route.request().postDataJSON();posted.push(body);attempts++;
    assert.equal(Object.keys(body.answers).length,9);
    for(const question of questions)assert(body.answers[question.id].trim());
    assert.equal(body.answers.q4,'employee — по участникам','display translation must retain the original value');
    assert.equal(body.answers.q6,'Гистограммы/бар-чарты');
    assert.equal(body.answers.q9,'Мои требования к анализу');
    if(attempts===1)return route.abort('failed');
    assert.equal(body.idempotency_key,posted[0].idempotency_key);
    run.state='completed';run.user_request=null;await route.fulfill({json:run});
   });
   await page.goto('http://localhost:5173/app/calls');
   if(theme==='dark')await page.getByRole('button',{name:'Включить тёмную тему',exact:true}).click();
   const launcher=page.getByRole('button',{name:'Поиск и помощник по звонкам',exact:true});await launcher.click();
   if(width>650)await page.getByRole('button',{name:'Развернуть',exact:true}).click();if(await page.locator('.assistant-history').getAttribute('aria-hidden')==='true')await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();
   const form=page.locator('.assistant-questions');await form.waitFor();
   const submit=page.getByRole('button',{name:'Ответить и продолжить',exact:true});
   assert.equal(await page.locator('div.assistant-answer-submit,.assistant-unanswered').count(),0,'submit must have no floating panel');
   assert.equal(await submit.evaluate(node=>getComputedStyle(node).position),'static');
   await submit.click();assert.equal(posted.length,0);await page.locator('fieldset[aria-invalid=true]').first().waitFor();
   assert.equal(await page.evaluate(()=>document.activeElement.type),'radio');
   assert(!/none|employee|high-level|бар-чарты|Таймлайн/.test(await form.innerText()));
   const fields=form.locator('fieldset');
   const lastField=await fields.last().boundingBox(),submitBox=await submit.boundingBox();assert(submitBox.y>=lastField.y+lastField.height,'submit overlays questions');
   for(let i=0;i<8;i++)await fields.nth(i).getByRole('radio').nth(i===3?1:0).check();
   await fields.nth(8).getByRole('textbox').fill('Мои требования к анализу');
   assert.equal(await form.locator('[role=status]').innerText(),'Заполнено 9 из 9. Можно выбрать вариант или написать свой ответ.');
   await page.getByRole('button',{name:'Свернуть вопросы',exact:true}).click();
   await page.getByRole('button',{name:'Ответить на вопросы — запрос ожидает вашего решения',exact:true}).click();
   if(await page.locator('.assistant-history').getAttribute('aria-hidden')==='true')await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Второй чат',exact:true}).click();assert.equal(await form.count(),0);
   if(await page.locator('.assistant-history').getAttribute('aria-hidden')==='true')await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();await form.waitFor();
   assert.equal(await form.locator('input:checked').count(),8);assert.equal(await fields.nth(8).getByRole('textbox').inputValue(),'Мои требования к анализу');
   await page.getByRole('button',{name:'Свернуть помощника',exact:true}).click();await launcher.click();await form.waitFor();assert.equal(await form.locator('input:checked').count(),8);
   // A page reload remounts the form; restore selections for this request only.
   await page.reload();await launcher.click();
   if(width>650)await page.getByRole('button',{name:'Развернуть',exact:true}).click();if(await page.locator('.assistant-history').getAttribute('aria-hidden')==='true')await page.getByRole('button',{name:'История чатов',exact:true}).click();
   await page.getByRole('button',{name:'Первый чат',exact:true}).click();await form.waitFor();assert.equal(await form.locator('input:checked').count(),8);
   const styles=await fields.first().locator('.assistant-answer-option').first().evaluate(node=>({size:getComputedStyle(node).fontSize,weight:getComputedStyle(node).fontWeight}));assert.equal(styles.size,'16px');assert.equal(styles.weight,'400');
   for(const label of await form.locator('.assistant-answer-option').all()){
    const outer=await label.boundingBox(),caption=await label.locator('span').last().boundingBox();assert(caption.x+caption.width<=outer.x+outer.width+1,'text overflows');
    const alignment=await label.evaluate(node=>{const radio=node.querySelector('input').getBoundingClientRect(),number=node.querySelector('.assistant-option-number').getBoundingClientRect(),text=node.querySelector('span:last-child');const line=parseFloat(getComputedStyle(text).lineHeight),top=text.getBoundingClientRect().top;return{radio:radio.top+radio.height/2,number:number.top+number.height/2,text:top+line/2,weight:getComputedStyle(text).fontWeight};});
    assert(Math.abs(alignment.radio-alignment.text)<1,'radio is not centered on the first text line');assert(Math.abs(alignment.number-alignment.text)<1,'number is not centered on the first text line');assert.equal(alignment.weight,'400');
   }
   await fields.nth(3).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`form-${width}-${theme}.png`)});
   await submit.click();await page.locator('.assistant-error').waitFor();await submit.click();await form.waitFor({state:'detached'});
   assert.equal(posted.length,2);assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('vt-assistant-answers:'))),false);
   assert.deepEqual(mock.errors,[]);await context.close();console.log('PASS',theme,width);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
