// Refresh the distant monitor pictures after changing the actual owner UI.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp=require('../../.cache/asset-tools/node_modules/sharp');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const theme of ['light','dark']){const page=await browser.newPage({viewport:{width:1400,height:787}});await page.goto(`http://127.0.0.1:5173/demo.html?role=owner&theme=${theme}`);await page.locator('.empty-slot').waitFor();await page.evaluate(async t=>{document.documentElement.dataset.theme=t;await document.fonts.ready},theme);await page.waitForTimeout(250);const buffer=await page.screenshot();await sharp(buffer).resize({width:700}).jpeg({quality:72}).toFile(`public/assets/scene/screens/owner-${theme}.jpg`);await page.close()}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
