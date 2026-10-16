// Exercises module loading and recovery only. Every API call is mocked.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const source = await fs.readFile(path.join(__dirname, 'verify-assistant-revisions.cjs'), 'utf8');
  const install = new Function('require', source.slice(0, source.indexOf('(async()=>{')) + '\nreturn install;')(require);
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const output = path.resolve(__dirname, '../docs/verification/assistant-opening');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage(), mock = await install(page);
      await page.goto('http://localhost:5173/app/calls');
      const launcher = page.getByRole('button', { name: 'Поиск и помощник по звонкам', exact: true });
      await launcher.waitFor();
      let lateRequests = 0;
      // Once the shell is ready, no additional module request may be required
      // just to open the assistant, even when that network path fails.
      await page.route('**/assets/AssistantWorkspace-*.js', route => { lateRequests++; return route.fulfill({ status: 404, body: 'Not found' }); });
      for (let attempt = 0; attempt < 4; attempt++) {
        await launcher.click();
        await page.getByRole('region', { name: 'Поиск и исследование звонков' }).waitFor().catch(async () => { await page.locator('.assistant-workspace').waitFor(); });
        await page.getByRole('textbox', { name: 'Запрос по звонкам' }).waitFor();
        await page.getByRole('button', { name: 'Свернуть помощника', exact: true }).click();
      }
      assert.equal(lateRequests, 0); assert.deepEqual(mock.errors, []);
      const toggle = page.locator('.app-header .vt-theme-toggle');
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await toggle.click();
        for (const hover of [false, true]) {
          if (hover) await toggle.hover(); else await page.mouse.move(0, 0);
          const style = await toggle.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopWidth }));
          assert.equal(style.background, 'rgba(0, 0, 0, 0)'); assert.equal(style.border, '0px');
        }
      }
      await page.screenshot({ path: path.join(output, `header-${width}.png`), fullPage: true });
      await context.close(); console.log(`PASS repeated opening and transparent theme button: ${width}`);
    }

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); await install(page);
    let badResponse = true, navigations = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    await page.route(/\/api\/v1\/assistant\/chats(?:\?|$)/, route => {
      if (badResponse && route.request().method() === 'GET') { badResponse = false; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":null}' }); }
      return route.fallback();
    });
    await page.goto('http://localhost:5173/app/calls');
    await page.getByRole('button', { name: 'Поиск и помощник по звонкам', exact: true }).click();
    await page.getByRole('alert', { name: 'Ошибка открытия чата', exact: true }).waitFor();
    assert.equal(await page.locator('.app-shell').count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Не удалось открыть раздел', exact: true }).count(), 0);
	const beforeRetry = navigations;
    await page.getByRole('button', { name: 'Повторить открытие', exact: true }).click();
    await page.getByRole('textbox', { name: 'Запрос по звонкам' }).waitFor();
    assert.equal(navigations, beforeRetry, 'retry must not reload the page');
    await context.close(); console.log('PASS runtime failure isolated to chat, retry without page reload');

    // A retained pre-change entry reproduces an already-open old tab. Its
    // deferred workspace must still load after the new build was published.
    const assets = path.resolve(__dirname, '../dist/assets');
    const names = await fs.readdir(assets);
    let oldEntry;
    for (const name of names.filter(name => /^main-.*\.js$/.test(name))) {
      const code = await fs.readFile(path.join(assets, name), 'utf8');
      if (code.includes('AuthenticatedShell-DhGfaiyY.js')) { oldEntry = name; break; }
    }
    assert(oldEntry, 'the known prior entry must be retained for this migration check');
    const oldContext = await browser.newContext({ reducedMotion: 'reduce' }), oldPage = await oldContext.newPage();
    const oldMock = await install(oldPage);
    const html = (await fs.readFile(path.resolve(__dirname, '../dist/app.html'), 'utf8'))
      .replace(/<script\b[^>]*src="\/assets\/[^"]+"[^>]*><\/script>/g, '')
      .replace('</head>', `<script type="module" src="/assets/${oldEntry}"></script></head>`);
    await oldPage.route('**/app/calls', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await oldPage.goto('http://localhost:5173/app/calls');
    await oldPage.getByRole('button', { name: 'Поиск и помощник по звонкам', exact: true }).click();
    await oldPage.getByRole('textbox', { name: 'Запрос по звонкам' }).waitFor();
    assert.deepEqual(oldMock.errors, []); await oldContext.close();
    console.log('PASS retained old page can open its deferred chat after publication');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
