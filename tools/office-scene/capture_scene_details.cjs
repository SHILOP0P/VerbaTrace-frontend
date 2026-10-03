// Actual runtime views. Inspection poses are saved through the existing pose restoration path.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const origin = process.env.OFFICE_QA_ORIGIN || 'http://127.0.0.1:5173';
const dir = 'docs/scene-upgrade/generated/qa/details';
fs.mkdirSync(dir, { recursive: true });
const report = { origin, cases: [], errors: [], note: 'Real browser renders; first/second floor use explicitly labelled inspection poses, not new story routes.' };
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const height of [1.75, 5.15]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        await context.addInitScript(height => {
          sessionStorage.setItem('verbatrace.landing.scene-step', JSON.stringify({step: 0, at: Date.now()}));
          sessionStorage.setItem('verbatrace.landing.camera-pose', JSON.stringify({revision: 'office-v18-restored-city-shared-room-approach', shotKey: 'hero', at: Date.now(), position: [10, height, -13], target: [10, height, -40], fov: 55, active: false}));
        }, height);
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        page.on('console', message => { if (message.type() === 'error' && /WebGL|shader|compile/i.test(message.text())) report.errors.push(message.text()); });
        await page.goto(origin + '/?sceneQA=1');
        await page.waitForFunction(() => window.__officeDiagnostics?.ready, null, {timeout: 60000});
        await page.locator('.landing-loader').waitFor({state: 'detached', timeout: 15000});
        const data = await page.evaluate(() => ({ frame: window.__officeDiagnostics.frames.at(-1), buffer: window.__officeDiagnostics.buffer, renderer: window.__officeDiagnostics.renderer, appearances: window.__officeDiagnostics.appearances, exterior: window.__officeDiagnostics.exterior }));
        if (!data.exterior?.city || data.exterior.legacyObjects.length) throw Error('City missing or legacy exterior remains');
        if (Math.abs(data.frame.camera[1] - height) > .01) throw Error('Inspection height was not restored');
        const file = height < 3 ? 'exterior-first-floor.png' : 'exterior-second-floor.png';
        await page.screenshot({path: dir + '/' + file});
        report.cases.push({file, ...data});
      } finally { await context.close(); }
    }
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    try {
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', message => { if (message.type() === 'error' && /WebGL|shader|compile/i.test(message.text())) report.errors.push(message.text()); });
      await page.goto(origin + '/?sceneQA=1');
      await page.waitForFunction(() => window.__officeDiagnostics?.ready, null, {timeout: 60000});
      await page.locator('.landing-loader').waitFor({state: 'detached', timeout: 15000});
      await page.screenshot({path: dir + '/hall-colours.png'});
      await page.getByRole('button', {name: 'Кабинет руководителя отдела', exact: true}).click();
      await page.waitForFunction(() => window.__officeDiagnostics.frames.at(-1)?.shot === 'leader' && window.__officeDiagnostics.frames.at(-1).progress >= 1, null, {timeout: 15000});
      await page.getByRole('button', {name: 'Рабочее место заместителя', exact: true}).click();
      for (const phase of [.62, .70, .80, .90, 1]) {
        await page.waitForFunction(phase => window.__officeDiagnostics.frames.at(-1)?.shot === 'deputy' && window.__officeDiagnostics.frames.at(-1).progress >= phase, phase, {timeout: 15000});
        const frame = await page.evaluate(() => window.__officeDiagnostics.frames.at(-1));
        const file = 'deputy-entry-' + Math.round(phase * 100) + '.png';
        await page.screenshot({path: dir + '/' + file});
        report.cases.push({file, frame});
      }
    } finally { await context.close(); }
    report.passed = report.errors.length === 0;
  } catch (e) { report.errors.push(e.stack); report.passed = false; }
  finally {
    await browser.close();
    report.finished = new Date().toISOString();
    fs.writeFileSync(dir + '/report.json', JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
    console.log(JSON.stringify({passed: report.passed, cases: report.cases.length, errors: report.errors}));
  }
})();
