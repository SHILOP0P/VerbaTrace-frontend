// Separate cold-context probe: start only after the actual loader and all demo pages are ready.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/muxa4/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const crypto = require('node:crypto');
const origin = process.env.OFFICE_QA_ORIGIN || 'http://127.0.0.1:5173';
const report = { origin, started: new Date().toISOString(), cases: [], errors: [],
  method: 'New browser context per case; native navigation immediately after GPU preparation, four demo-ready messages and removal of loading curtain. No recording or other browser QA in parallel.',
  limits: 'Frame intervals include browser/OS scheduling. This probe does not establish physical-phone performance or absence of all stalls.',
  assetHash: crypto.createHash('sha256').update(fs.readFileSync('public/assets/scene/office.glb')).digest('hex') };
const output = 'docs/scene-upgrade/generated/qa/first-flight-report.json';
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-backgrounding-occluded-windows'] });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      try {
        await context.addInitScript(() => {
          window.__readyDemoRoles = [];
          window.addEventListener('message', event => {
            if (event.origin !== location.origin || event.data?.type !== 'vt-demo:ready') return;
            try {
              const role = new URL(event.source.location.href).searchParams.get('role');
              if (role && !window.__readyDemoRoles.includes(role)) window.__readyDemoRoles.push(role);
            } catch { /* Ignore unrelated frames. */ }
          });
        });
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        await page.goto(origin + '/?sceneQA=1');
        await page.waitForFunction(() => window.__officeDiagnostics?.ready && window.__readyDemoRoles?.length === 4, null, { timeout: 60000 });
        await page.locator('.landing-loader').waitFor({ state: 'detached', timeout: 15000 });
        const profiler = process.env.OFFICE_QA_PROFILE ? await context.newCDPSession(page) : null;
        if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
        const start = await page.evaluate(() => window.__officeDiagnostics.frames.length);
        await page.getByRole('button', { name: 'Рабочее место сотрудника', exact: true }).click();
        await page.waitForFunction(() => {
          const frame = window.__officeDiagnostics?.frames.at(-1);
          return frame?.shot === 'employee' && frame.progress >= 1 && !document.querySelector('.scene-block')?.classList.contains('is-flying');
        }, null, { timeout: 25000 });
        if (profiler) {
          const data = await profiler.send('Profiler.stop');
          fs.writeFileSync('.cache/first-flight-cpu-' + viewport.width + '.json', JSON.stringify(data.profile));
        }
        const result = await page.evaluate(start => {
          const frames = window.__officeDiagnostics.frames.slice(start).filter(f => f.flying);
          const intervals = frames.map(f => f.dt).sort((a, b) => a - b);
          return { samples: intervals.length, p50: intervals[Math.floor(intervals.length * .5)], p95: intervals[Math.floor(intervals.length * .95)], max: intervals.at(-1), over25ms: intervals.filter(v => v > 25).length,
            slowFrames: frames.filter(f => f.dt > 25), longTasks: window.__officeDiagnostics.longTasks, renderer: window.__officeDiagnostics.renderer, buffer: window.__officeDiagnostics.buffer, readyRoles: window.__readyDemoRoles };
        }, start);
        if (!result.samples) throw new Error('First flight did not provide frame samples');
        report.cases.push({ viewport, ...result });
        console.log(JSON.stringify(report.cases.at(-1)));
      } finally { await context.close(); }
    }
    report.completed = true;
  } catch (e) { report.errors.push(e.stack); process.exitCode = 1; }
  finally {
    await browser?.close();
    report.finished = new Date().toISOString();
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
  }
})();
