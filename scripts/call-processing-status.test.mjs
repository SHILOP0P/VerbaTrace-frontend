import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const output = await build({ entryPoints: ['src/shared/lib/call-status.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { callStatusChip, callStatusTone } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
test('ready transcript awaiting requested analysis remains pending, including before analysis exists', () => {
  assert.equal(callStatusChip('transcribed'), 'В очереди на анализ');
  assert.equal(callStatusTone('transcribed'), 'warn');
  assert.equal(callStatusChip('transcribed', 'pending'), 'В очереди на анализ');
  assert.equal(callStatusChip('transcribed', 'processing'), 'Анализируется');
  assert.equal(callStatusTone('transcribed', 'processing'), 'warn');
  assert.equal(callStatusChip('transcribed', undefined, true), 'Транскрипция готова');
  assert.equal(callStatusTone('transcribed', undefined, true), 'ok');
  assert.equal(callStatusTone('analyzed', 'done'), 'ok');
  assert.equal(callStatusTone('transcribed', 'failed'), 'bad');
});
