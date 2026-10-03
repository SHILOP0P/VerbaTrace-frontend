const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
const dir='docs/scene-upgrade/generated/qa';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];try{
for(const width of [1280,1024,390,360]) for(const theme of ['light','dark']) {
 const page=await browser.newPage({viewport:{width,height:900}});await page.goto('http://127.0.0.1:5173/demo.html?role=owner');
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 const slot=page.locator('.empty-slot').first();await slot.waitFor();const input=slot.locator('input');
 const text='Северный ветер — расширенное название компании для проверки последнего символа';
 await input.click();await input.pressSequentially(text,{delay:1});
 const manual=await input.evaluate(e=>({length:e.value.length,caret:e.selectionEnd,scroll:e.scrollLeft,client:e.clientWidth,extent:e.scrollWidth}));
 if(manual.caret!==text.length||manual.scroll<=0)throw Error('native caret not visible '+width);
 await input.fill('');
 // Exercise the actual demo player with an oversized name in a narrow input.
 await page.evaluate(async text=>{const {createScenarioPlayer}=await import('/src/demo/scenario.ts');const player=createScenarioPlayer([{kind:'type',target:'.create-company-form.compact input',text,perChar:2},{kind:'wait',ms:100000}],()=>{});window.__cardPlayer=player;player.play()},text);
 await page.waitForFunction(text=>document.querySelector('.create-company-form.compact input')?.value===text,text);
 await page.waitForTimeout(50);
 const script=await input.evaluate(e=>({length:e.value.length,caret:e.selectionEnd,scroll:e.scrollLeft,client:e.clientWidth,extent:e.scrollWidth}));
 if(script.caret!==text.length||script.scroll<=0)throw Error('script caret not visible '+width);
 const layout=await slot.evaluate(e=>{const r=e.getBoundingClientRect(),form=e.querySelector('form'),i=form.querySelector('input'),button=form.querySelector('button'),desc=e.querySelector('.company-slot-description');const rect=o=>{const q=o.getBoundingClientRect();return{x:q.x,y:q.y,width:q.width,height:q.height,right:q.right,bottom:q.bottom}};return{card:rect(e),input:rect(i),button:rect(button),gap:form.getBoundingClientRect().top-desc.getBoundingClientRect().bottom,buttonWhiteSpace:getComputedStyle(button).whiteSpace,overflow:e.scrollWidth>e.clientWidth+1}});
 if(layout.overflow||layout.gap>20||layout.button.right>layout.card.right+1||layout.input.right>layout.card.right+1||layout.buttonWhiteSpace!=='nowrap')throw Error('card layout '+width);
 await slot.screenshot({path:`${dir}/owner-card-${width}-${theme}.png`});await page.evaluate(()=>window.__cardPlayer.destroy());
 results.push({width,theme,manual,script,layout});await page.close();
}
fs.writeFileSync(dir+'/owner-card-report.json',JSON.stringify({passed:true,cases:results},null,2));console.log('Owner card: '+results.length+' viewport/theme cases passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
