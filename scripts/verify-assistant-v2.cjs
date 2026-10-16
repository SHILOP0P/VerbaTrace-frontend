// Deterministic browser acceptance with an isolated API fixture; no paid calls.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const at = '2026-10-11T12:00:00Z';
const chatId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const graphicId = '33333333-3333-4333-8333-333333333333';
const calculationId = '44444444-4444-4444-8444-444444444444';
const questionId = '55555555-5555-4555-8555-555555555555';
const source = { id:'77777777-7777-4777-8777-777777777777',call_uuid:chatId,call_title:'Учебное собеседование',quote:'Уточнил требования задачи',transcription_revision:2,source_kind:'transcription',origin:'snapshot',word_start_index:1,word_end_index:3 };
const calculation = { id: calculationId, method: 'count', unit: 'calls', period: 'Октябрь 2026', selected_calls: 24, checked_calls: 24, matched_calls: 24, not_matched_calls: 0, uncertain_calls: 0, not_applicable_calls: 0, excluded_calls: 0, metrics: [], rows: [], data_hash: 'fixture' };
const graphic = { id: graphicId, version_uuid: '66666666-6666-4666-8666-666666666666', title: 'Проверенная выборка', description: 'Проверены все 24 записи контрольной выборки.', calculation_id: calculationId, calculation, view: { kind: 'bar', group_by: 'none' }, created_at: at };

async function fixture(page, allowed, options = {}) {
  let messages = [], run = null, polls = 0, answered = false, exportedPolls = 0;
  const submitted = [];
  const user = { id: chatId, email: 'qa@example.test', full_name: 'Тест', full_surname: 'Проверка', username: '@qa', role: 'user', created_at: at };
  const chat = { id: chatId, title: 'Контрольное исследование', mode: 'research', response_detail: 'auto', created_at: at, updated_at: at, lock_version: 1 };
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.replace('/api/v1', '');
    let body = {}, status = 200;
    if (endpoint === '/auth/session') body = { access_available: true, refresh_available: true };
    else if (endpoint === '/auth/refresh') body = { user };
    else if (endpoint === '/auth/me') body = user;
    else if (endpoint === '/companies' || endpoint.startsWith('/instructions') || endpoint.includes('invitations')) body = [];
    else if (endpoint === '/assistant/capabilities') body = { schema_version: 2, chat_enabled: allowed, search_enabled: allowed, aggregate_enabled: allowed, export_enabled: allowed };
    else if (endpoint === '/notifications') body = { notifications: [], unread_count: 0 };
    else if (endpoint === '/assistant/chats') body = { items: [chat] };
    else if (endpoint === '/assistant/draft') { const input = request.method() === 'PATCH' ? request.postDataJSON() : {}; body = { text: input.text || '', context: input.context || { items: [], mode: 'research' }, lock_version: (input.lock_version || 0) + 1, updated_at: at }; }
    else if (endpoint === `/assistant/chats/${chatId}/messages`) {
      if (request.method() === 'POST') {
        const input = request.postDataJSON(); submitted.push(input);
        messages = [{ id: 'user-fixture', role: 'user', text: input.text, blocks: [], sources: [], created_at: at, status: 'completed' }];
        run = { id: runId, chat_uuid: chatId, mode: input.mode, state: 'queued', schema_version: 2, stage: 'Подготовка запроса', progress: { selected_calls: 24, checked_calls: 0 } };
        body = run;
      } else body = { items: options.markdown ? messages.map(message=>message.role==='assistant'?{...message,blocks:[...message.blocks,{type:'grounded_text',text:options.markdown,data:{source_ids:[source.id],artifact_ids:[graphicId]}}]}:message) : messages };
    } else if (endpoint === `/assistant/runs/${runId}/answers`) {
      const input = request.postDataJSON(); assert.equal(input.request_uuid, questionId); assert.equal(input.answers.unit, 'Звонки'); answered = true; run = { ...run, state: 'processing', user_request: null }; body = run;
    } else if (endpoint === `/assistant/runs/${runId}`) {
      polls++;
      if (!answered && polls >= 2) run = { ...run, state: 'awaiting_user', user_request: { request_uuid: questionId, kind: 'clarification', delivery: 'form', message: 'Уточните единицу подсчёта', questions: [{ id: 'unit', title: 'Что считать?', options: ['Звонки', 'Эпизоды', 'Участники'] }], calls: [] } };
      else if (answered) { run = { ...run, state: 'completed', progress: { selected_calls: 24, checked_calls: 24 } }; messages = [...messages.filter(m => m.role === 'user'), { id: 'answer-fixture', role: 'assistant', text: 'Полностью проверены 24 звонка.', blocks: [{ type: 'grounded_text', text: 'Полностью проверены 24 звонка.', data: { artifact_ids: [graphicId], calculation_ids: [calculationId], source_ids: [source.id] } }], sources: [source], research: { schema_version: 2, selection: { run_uuid: runId }, graphics: [graphic], calculations: [calculation] }, created_at: at, status: 'completed' }]; }
      else run = { ...run, state: 'processing', stage: 'Проверка звонков', progress: { selected_calls: 24, checked_calls: 12 } };
      body = run;
    } else if (endpoint.endsWith('/new-calls')) body = { count: 2, basis: 'metadata_filters', content_checked: false };
    else if (endpoint.endsWith(`/sources/${source.id}`)) body=source;
    else if (endpoint.endsWith(`/sources/${source.id}/content`)) body={text:'Начало Уточнил требования задачи',words:['Начало','Уточнил','требования','задачи'].map((text,index)=>({text,start_seconds:index,end_seconds:index+1}))};
    else if (endpoint === `/assistant/artifacts/${graphicId}`) body = { ...graphic, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 280"><rect width="600" height="280" fill="white"/><text x="25" y="35">Проверено 24 звонка</text><rect x="25" y="70" width="480" height="100" fill="#6b65d8"/></svg>' };
    else if (endpoint.endsWith('/exports') && request.method() === 'POST') body = { id: 'export-fixture', format: request.postDataJSON().format, content: request.postDataJSON().content, state: 'queued', created_at: at };
    else if (endpoint === '/assistant/exports/export-fixture') { exportedPolls++; body = { id: 'export-fixture', format: 'pdf', content: 'conversation', state: exportedPolls >= 3 ? 'completed' : 'rendering', filename: 'report.pdf', created_at: at }; }
    else if (endpoint.includes('calls') || endpoint.includes('folders') || endpoint.includes('notifications')) body = { items: [], total: 0, unread_count: 0 };
    else { status = 404; body = { error: { code: 'fixture_unused', message: 'Unused isolated endpoint' } }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return { submitted, getExportPolls: () => exportedPolls };
}

if (require.main === module) (async () => {
  const output = process.env.ASSISTANT_BROWSER_QA_DIR || path.resolve(__dirname, '../docs/verification/assistant-v2');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
      page.on('pageerror', error => console.error('Browser error:',error.stack));
      const mock = await fixture(page, true);
      await page.goto('http://localhost:5173/app/calls');
	  if (theme === 'dark') await page.getByRole('button', { name: 'Включить тёмную тему', exact: true }).click();
      await page.getByRole('button', { name: 'Поиск и помощник по звонкам', exact: true }).click();
      await page.getByRole('button', { name: 'История чатов', exact: true }).click();
      await page.getByRole('button', { name: 'Контрольное исследование', exact: true }).click();
      await page.getByRole('textbox', { name: 'Запрос по звонкам' }).fill('Посчитай все звонки');
      await page.getByRole('button', { name: 'Отправить запрос', exact: true }).click();
      await page.getByText('Проверено 12 из 24', { exact: false }).waitFor();
      assert.equal(await page.getByText('Полностью проверены 24 звонка.', { exact: true }).count(), 0);
      await page.locator('.assistant-questions').waitFor();
      await page.getByRole('button', { name: 'Свернуть вопросы' }).click();
      assert.equal(await page.getByText('Полностью проверены 24 звонка.', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Ответить на вопросы — запрос ожидает вашего решения' }).click();
      await page.getByRole('radio').first().check();
      await page.getByRole('button', { name: 'Ответить и продолжить' }).click();
      await page.getByText('Полностью проверены 24 звонка.', { exact: true }).waitFor();
      assert.equal(mock.submitted[0].schema_version, 2); assert.equal(mock.submitted[0].mode, 'research');
      await page.getByRole('button', { name: 'Диаграммы · 1' }).click();
      await page.locator('.assistant-graphic-canvas svg').waitFor();
      await page.getByRole('button',{name:'Открыть диаграмму «Проверенная выборка»',exact:true}).click();
      await page.getByRole('dialog',{name:'Проверенная выборка',exact:true}).waitFor();
      await page.getByRole('button',{name:'Закрыть диаграмму',exact:true}).click();
      await page.screenshot({ path: path.join(output, `workspace-${width}${theme === 'dark' ? '-dark' : ''}.png`), fullPage: true });
      const bounds = await page.locator('.assistant-workspace').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      if (width > 650) {
        await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
        await page.getByRole('option', { name: 'PDF', exact: true }).click();
        await page.locator('.assistant-export-menu').getByRole('button', { name: 'Скачать PDF', exact: true }).click();
        await page.locator('.assistant-export-ready').filter({ hasText: 'Скачать PDF' }).waitFor({ timeout: 12000 });
        assert(mock.getExportPolls() >= 3, 'poll must continue when state stays unchanged');
      }
      await page.getByRole('button',{name:'Свернуть панель',exact:true}).click();
      await page.getByRole('button',{name:'Источники · 1',exact:true}).click();
      await page.getByRole('button',{name:'Использованный материал',exact:true}).click();
      await page.getByLabel('Сохранённый материал исследования').waitFor();
      assert.equal(await page.locator('.assistant-source-content .is-evidence').count(),3);
	  await page.getByRole('button',{name:'Свернуть панель',exact:true}).click();
	  await page.getByRole('button',{name:'Диаграммы · 1',exact:true}).click();
	  await page.getByRole('button',{name:'Изменить диаграмму через чат',exact:true}).click();
	  const composer = page.getByRole('textbox', { name: 'Запрос по звонкам' });
	  assert((await composer.inputValue()).includes('Проверенная выборка'));
	  if (width === 390) assert.equal(await page.locator('.assistant-inspector-content').count(),0, 'the mobile composer must be accessible after requesting a revision');
      assert.deepEqual(errors, []); await context.close();
    }
    const context = await browser.newContext(); const page = await context.newPage(); await fixture(page, false); await page.goto('http://localhost:5173/app/calls');
    await page.locator('.app-shell').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Поиск и помощник по звонкам', exact: true }).count(), 0);
    await context.close(); console.log('PASS: light/dark desktop/mobile, access hiding, full-only publication, explicit question response, graphics, revision composer, repeated export polling');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = {fixture,graphic,calculation,source};
