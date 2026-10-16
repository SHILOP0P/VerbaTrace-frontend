const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fixture, graphic, calculation, source } = require('./verify-assistant-v2.cjs');
const output = path.resolve(__dirname, '../docs/verification/assistant-content-ui');
const markdown = '## Результат\n\n- Первый проверенный ответ\n- Второй проверенный ответ\n\n| Тема | Результат |\n| --- | --- |\n| Каналы | Исправлено самостоятельно |\n\n' + Array.from({ length: 30 }, (_, i) => `Абзац ${i + 1}. Подробное объяснение проверенного ответа.`).join('\n\n');
calculation.method = 'semantic';
calculation.content = { case_count: 2, complete: true, data_hash: 'content', references: [] };
graphic.content_binding = { metric: 'self_corrections', group_by: 'topic' };
if(process.env.ASSISTANT_QA_COLOR) graphic.view.color = process.env.ASSISTANT_QA_COLOR;
const nearly = (a, b, label) => assert(Math.abs(a - b) <= 2, `${label}: ${a} vs ${b}`);
const settleLayout = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function measure(page) {
  return page.locator('.assistant-workspace').evaluate(root => {
    const rect = selector => root.querySelector(selector)?.getBoundingClientRect().toJSON();
    return { workspace: root.getBoundingClientRect().toJSON(), left: rect('.assistant-history'), right: rect('.assistant-inspector'), chat: rect('.assistant-conversation'), overflow: root.scrollWidth - root.clientWidth };
  });
}
async function resizeChecks(page, width) {
  const left = page.getByRole('separator', { name: 'Ширина списка чатов', exact: true });
  const right = page.getByRole('separator', { name: 'Ширина правой панели', exact: true });
  for (const [separator, selector, delta] of [[left, '.assistant-history', 60], [right, '.assistant-inspector', -50]]) {
    const initial = await page.locator(selector).evaluate(el => el.getBoundingClientRect().width);
    const handle = await separator.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + delta, handle.y + handle.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(([selector, value]) => Math.abs(document.querySelector(selector).getBoundingClientRect().width - value) <= 2, [selector, Number(await separator.getAttribute('aria-valuenow'))]);
    const actual = await page.locator(selector).evaluate(el => el.getBoundingClientRect().width);
    assert(actual > initial + 10, `${selector} pointer resize changes visible width`);
    nearly(actual, Number(await separator.getAttribute('aria-valuenow')), `${selector} ARIA matches width`);
    await separator.press('Home');
    await settleLayout(page);
    nearly(await page.locator(selector).evaluate(el => el.getBoundingClientRect().width), Number(await separator.getAttribute('aria-valuemin')), 'Home reaches minimum');
    await separator.press('End');
    await settleLayout(page);
    nearly(await page.locator(selector).evaluate(el => el.getBoundingClientRect().width), Number(await separator.getAttribute('aria-valuemax')), 'End reaches maximum');
    await separator.press(selector.includes('history') ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForFunction(([selector, width]) => Math.abs(document.querySelector(selector).getBoundingClientRect().width - width) <= 2, [selector, Number(await separator.getAttribute('aria-valuenow'))]);
    nearly(await page.locator(selector).evaluate(el => el.getBoundingClientRect().width), Number(await separator.getAttribute('aria-valuenow')), 'Arrow resizes from actual width');
    await separator.press('Home');
    await settleLayout(page);
  }
  const sizes = await measure(page);
  assert(sizes.overflow <= 1, 'workspace must not overflow');
  assert(sizes.chat.width >= 319, 'chat remains readable');
  const saved = await page.evaluate(() => localStorage.getItem('vt.assistant.panel-widths.v1'));
  assert.deepEqual(JSON.parse(saved), { left: 160, right: 240 });
  if (width === 1440) {
    await page.setViewportSize({ width: 1025, height: 1000 });
    await settleLayout(page);
    await right.press('End');
    await settleLayout(page);
    const shrunk = await measure(page);
    assert(shrunk.chat.width >= 319, 'viewport change maintains chat minimum');
    nearly(shrunk.right.width, Number(await right.getAttribute('aria-valuenow')), 'viewport ARIA width is current');
    await page.setViewportSize({ width, height: 1000 });
    await settleLayout(page);
    await right.press('Home');
    await settleLayout(page);
  }
  await page.reload();
  await page.getByRole('button', { name: 'Поиск и помощник по звонкам', exact: true }).click();
  await page.getByRole('button', { name: 'Развернуть', exact: true }).click();
  await page.getByRole('button', { name: 'Диаграммы · 1', exact: true }).click();
  await page.locator('.assistant-graphic-preview .assistant-native-plot').waitFor();
  const restored = await measure(page);
  nearly(restored.left.width, 160, 'history preference restored');
  nearly(restored.right.width, 240, 'inspector preference restored');
}

async function contrastChecks(page, width, theme) {
  const report = await page.evaluate(() => {
    const parse = text => {
      if (text.startsWith('color(srgb ')) { const values = text.slice(11, -1).split(/\s*\/\s*|\s+/).map(Number); return values.slice(0, 3).map(v => v * 255).concat([values[3] ?? 1]); }
      const match = text.match(/rgba?\(([^)]+)\)/);
      if (match) return match[1].split(/[,\s/]+/).filter(Boolean).map(Number).concat([1]).slice(0, 4);
      const probe = document.createElement('span'); probe.style.color = text; document.body.append(probe);
      const rgb = getComputedStyle(probe).color; probe.remove(); return parse(rgb);
    };
    const blend = (front, back) => [0, 1, 2].map(i => front[i] * front[3] + back[i] * (1 - front[3])).concat([1]);
    const background = el => {
      let stack = [], cursor = el;
      while (cursor) { stack.push(parse(getComputedStyle(cursor).backgroundColor)); cursor = cursor.parentElement; }
      return stack.reverse().reduce((back, front) => blend(front, back), [255, 255, 255, 1]);
    };
    const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    const pairs = [
      ['answer', '.assistant-prose p', 'color', 4.5], ['citation', '.assistant-evidence-links button', 'color', 4.5],
      ['source text', '.assistant-source span', 'color', 4.5], ['composer', '.assistant-composer textarea', 'color', 4.5],
      ['chart label', '.assistant-plot-row-caption span', 'color', 4.5], ['chart value', '.assistant-plot-row-caption strong', 'color', 4.5],
      ['chart unit', '.assistant-plot-unit', 'color', 4.5], ['chart bar', '.assistant-plot-track>span', 'backgroundColor', 3],
      ['send icon', '.assistant-send', 'color', 3]
    ];
    const measured = pairs.map(([label, selector, property, required]) => {
      const el = document.querySelector(selector); if (!el) return null;
      const bg = background(property === 'backgroundColor' ? el.parentElement : el), fg = blend(parse(getComputedStyle(el)[property]), bg);
      return { label, selector, ratio: ratio(fg, bg), required, font: getComputedStyle(el).fontSize, foreground: fg, background: bg };
    }).filter(Boolean);
    for (const el of document.querySelectorAll('.assistant-sidebar-resizer')) {
      if (!el.getBoundingClientRect().width) continue;
      measured.push({ label: 'resize handle', ratio: ratio(parse(getComputedStyle(el, '::before').backgroundColor), background(el)), required: 3 });
    }
    const chart = document.querySelector('.assistant-native-plot');
    if (chart) for (let index = 1; index <= 6; index++) measured.push({ label: `chart series ${index}`, ratio: ratio(parse(getComputedStyle(chart).getPropertyValue(`--assistant-plot-${index}`).trim()), background(chart)), required: 3 });
    const composer = document.querySelector('.assistant-composer');
    measured.push({ label: 'composer boundary', ratio: ratio(parse(getComputedStyle(composer).borderTopColor), background(composer.parentElement)), required: 3 });
    return measured;
  });
  for (const pair of report) assert(pair.ratio >= pair.required, `${theme} ${width}px ${pair.label}: ${pair.ratio.toFixed(2)} < ${pair.required}`);
  assert(report.find(pair => pair.label === 'answer').font === '16px');
  return { theme, width, measured: report };
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  const reports = [];
  let scenarios = 0;
  try {
    for (const theme of ['light', 'dark']) for (const width of (process.env.ASSISTANT_QA_WIDTH ? [Number(process.env.ASSISTANT_QA_WIDTH)] : [1440, 1024, 768, 390])) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await fixture(page, true, { markdown });
      await page.route('**/assistant/artifacts/**', async route => {
        const endpoint = new URL(route.request().url()).pathname;
        if (endpoint.endsWith('/content')) return route.fulfill({ json: { items: [{ id: 'episode', call_uuid: source.call_uuid, call_title: source.call_title, topic: 'Каналы', question: 'Что происходит при закрытии канала?', actual: 'Сначала неверно, затем исправлено', expected: 'Запись вызывает панику', explanation: 'Исправление кандидата подтверждено более поздней репликой', initial_status: 'incorrect', final_status: 'correct', correction: 'self', basis: 'subject_matter', evidence: [{ quote: 'Начальная реплика', start_seconds: 10 }], correction_evidence: [{ quote: 'Исправление', start_seconds: 40 }], reference_ids: [] }], total: 1 } });
        return route.fulfill({ json: { ...graphic, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', plot: { kind: 'bar', title: graphic.title, unit: 'эпизоды', points: [{ label: 'Закрытие каналов', x: 0, y: 2, count: 2 }, { label: 'Работа с типами', x: 0, y: 1, count: 1 }] } } });
      });
      await page.goto('http://localhost:5173/app/calls');
      if (theme === 'dark') await page.getByRole('button', { name: 'Включить тёмную тему', exact: true }).click();
      await page.getByRole('button', { name: 'Поиск и помощник по звонкам', exact: true }).click();
      await page.getByRole('button', { name: 'История чатов', exact: true }).click();
      await page.getByRole('button', { name: 'Контрольное исследование', exact: true }).click();
      await page.getByRole('textbox', { name: 'Запрос по звонкам' }).fill('Оцени ответы');
      await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
      await page.getByRole('radio').first().check({ timeout: 15000 });
      await page.getByRole('button', { name: 'Ответить и продолжить' }).click();
      await page.getByRole('heading', { name: 'Результат', exact: true }).waitFor();
      assert.equal(await page.locator('.assistant-prose ul li').count(), 2);
      assert.equal(await page.locator('.assistant-prose table tbody tr').count(), 1);
      const answer = page.locator('.assistant-message.assistant');
      assert.equal(await answer.locator('.assistant-prose button').count(), 0, 'reading sections have no repeated source or diagram controls');
      const resources = page.locator('.assistant-resources-panel');
      assert.equal(await resources.getByRole('button', { name: 'Источники · 1', exact: true }).count(), 1, 'one deduplicated source control for the entire answer');
      assert.equal(await resources.getByRole('button', { name: 'Диаграммы · 1', exact: true }).count(), 1, 'one deduplicated diagram control for the entire answer');
      assert(await resources.evaluate(el => !!(el.closest('.assistant-conversation').querySelector('.assistant-scroll').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)), 'materials follow the reading area and can be completely collapsed');
      assert.deepEqual(await answer.locator('.assistant-prose p').first().evaluate(el=>({size:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight})),{size:'16px',weight:'400'});
      if (width > 650) {
        await page.getByRole('button', { name: 'Развернуть', exact: true }).click();
        await page.addStyleTag({ content: 'body{min-height:3000px}' });
        const initial = await page.evaluate(() => scrollY);
        await page.locator('.assistant-composer').hover(); await page.mouse.wheel(0, 900); await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => scrollY), initial, 'background must not scroll');
        const before = await page.locator('.assistant-scroll').evaluate(el => el.scrollTop);
        await page.locator('.assistant-scroll').hover(); await page.mouse.wheel(0, -600); await page.waitForTimeout(100);
        assert((await page.locator('.assistant-scroll').evaluate(el => el.scrollTop)) < before, 'chat scroll must work');
      }
      await page.getByRole('button', { name: 'Диаграммы · 1', exact: true }).click();
      await page.locator('.assistant-graphic-preview .assistant-native-plot').waitFor();
      if (width >= 901) await resizeChecks(page, width);
      if (width === 768) {
        await page.getByRole('button', { name: 'История чатов', exact: true }).click();
        const handle = page.getByRole('separator', { name: 'Ширина списка чатов', exact: true });
        await handle.press('End');
        nearly(await page.locator('.assistant-history').evaluate(el => el.getBoundingClientRect().width), Number(await handle.getAttribute('aria-valuenow')), 'tablet overlay width matches ARIA');
        assert((await measure(page)).chat.width >= 319, 'tablet overlay preserves chat width');
        await page.getByRole('button', { name: 'Закрыть список чатов', exact: true }).click();
        assert.equal(await handle.count(), 0, 'overlay history can be closed without reaching covered header');
      }
      if (width <= 650) assert.equal(await page.getByRole('separator').count(), 0);
      const layout = await measure(page);
      assert(layout.workspace.left >= 0 && layout.workspace.right <= width, 'workspace inside viewport');
      assert(layout.overflow <= 1, 'no workspace horizontal overflow');
      reports.push(await contrastChecks(page, width, theme));
      if (width > 650) {
        await page.getByRole('button', { name: 'Источники · 1', exact: true }).click();
        await page.locator('.assistant-source span').waitFor();
        reports.push(await contrastChecks(page, width, theme));
        await page.getByRole('button', { name: 'Вложения и результаты', exact: true }).click();
        await page.locator('.assistant-graphic-preview .assistant-native-plot').waitFor();
      }
      await page.screenshot({ path: path.join(output, `workspace-${width}-${theme}.png`) });
      await page.getByRole('button', { name: 'Открыть диаграмму «Проверенная выборка»', exact: true }).click();
      await page.locator('dialog[open]').waitFor();
      await page.screenshot({ path: path.join(output, `diagram-${width}-${theme}.png`) });
      await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'hidden' });
      assert(await page.locator('.assistant-workspace').isVisible(), 'Escape closes diagram only');
      await page.getByRole('button', { name: 'Проверить данные', exact: true }).click();
      await page.locator('.assistant-content-case').getByText('Исправлено самостоятельно', { exact: true }).waitFor();
      assert.equal(await page.locator('.assistant-content-case').count(), 1);
      assert.deepEqual(errors, []);
      console.log(`PASS ${theme} ${width}px: layout, reading, native chart, contrast, Escape, evidence${width >= 901 ? ', drag, keyboard, persistence, limits' : ''}`);
      await context.close();
      scenarios++;
    }
    await fs.writeFile(path.join(output, 'contrast-report.json'), JSON.stringify(reports, null, 2));
    console.log(`PASS: ${scenarios} isolated viewport/theme scenarios, no paid API requests`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
