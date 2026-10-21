import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

test('document previews preserve literal PDF text and render safe scrollable spreadsheet tables', async () => {
  const result = await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {InstructionDocumentViewer} from './src/features/instructions/InstructionDocumentViewerV2'; export function render(filename,markdown){return renderToStaticMarkup(<InstructionDocumentViewer filename={filename} markdown={markdown}/>);}`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external' });
  // Import from a temporary local module so external React resolves normally.
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const directory = await mkdtemp(join(process.cwd(), '.preview-test-'));
  try {
    const path = join(directory, 'preview.mjs');
    await writeFile(path, result.outputFiles[0].text);
    const { render } = await import(pathToFileURL(path).href);
    const pdf = render('guide.PDF', 'Приветствие\n`err` *value* <script>alert(1)</script>');
    assert.match(pdf, /instruction-pdf-text/);
    assert.match(pdf, /`err` \*value\*/);
    assert.match(pdf, /&lt;script&gt;/);
    assert.doesNotMatch(pdf, /<(script|code|em)[ >]/);
    const sheet = render('guide.xlsx', '## Проверка звонка\n\n| Критерий | Вес |\n| --- | --- |\n| Приветствие | 2 |\n\n<script>alert(1)</script>\n\n![hidden](https://example.com/private.png)');
    assert.match(sheet, /role="region" aria-label="Таблица документа" tabindex="0"/);
    assert.match(sheet, /<table>/);
    assert.match(sheet, /<td>Приветствие<\/td>/);
    assert.doesNotMatch(sheet, /<(script|img)[ >]/);
    assert.match(render('scan.pdf', ''), /OCR/);
    assert.doesNotMatch(render('scan.pdf', ''), /подготавливается/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
