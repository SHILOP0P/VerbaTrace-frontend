import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { publishBuild } from './publish-build.mjs';
import { createSiteServer } from './serve.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'verbatrace-publish-'));
  t.after(async () => {
    const absolute = await realpath(root), parent = await realpath(tmpdir());
    assert.equal(dirname(absolute), parent); assert(basename(absolute).startsWith('verbatrace-publish-'));
    await rm(absolute, { recursive: true, force: true });
  });
  const dist = join(root, 'dist'), stage = join(root, 'stage');
  for (const path of [dist, stage]) await mkdir(join(path, 'assets'), { recursive: true });
  await writeFile(join(dist, 'app.html'), 'old app'); await writeFile(join(dist, 'index.html'), 'old public');
  await writeFile(join(dist, 'assets/AssistantWorkspace-abcdefgh.js'), 'export const version = "old";');
  await writeFile(join(stage, 'app.html'), 'new app'); await writeFile(join(stage, 'index.html'), 'new public');
  await writeFile(join(stage, 'assets/AssistantWorkspace-ijklmnop.js'), 'export const version = "new";');
  return { dist, stage };
}
test('live publication retains old module URLs and publishes documents after assets', async t => {
  const { dist, stage } = await fixture(t);
  const server = createSiteServer({ distDir: dist });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => new Promise(resolveClose => { server.closeAllConnections(); server.close(resolveClose); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  let assetSeen = false;
  await publishBuild(stage, dist, { onPublished: async file => {
    if (file.endsWith('.js')) {
      assetSeen = true;
      assert.equal(await (await fetch(url + '/app/calls')).text(), 'old app');
      assert.equal((await fetch(url + '/assets/AssistantWorkspace-ijklmnop.js')).status, 200);
    } else if (file.endsWith('.html')) assert(assetSeen);
  } });
  assert.equal(await (await fetch(url + '/app/calls')).text(), 'new app');
  assert.equal((await fetch(url + '/assets/AssistantWorkspace-abcdefgh.js')).status, 200);
});
test('invalid or colliding build cannot replace a served entry document', async t => {
  const { dist, stage } = await fixture(t);
  await writeFile(join(stage, 'assets/AssistantWorkspace-abcdefgh.js'), 'different content under old URL');
  await assert.rejects(publishBuild(stage, dist), /Immutable asset changed/);
  assert.equal(await readFile(join(dist, 'app.html'), 'utf8'), 'old app');
  assert.equal(await readFile(join(dist, 'assets/AssistantWorkspace-abcdefgh.js'), 'utf8'), 'export const version = "old";');
  await assert.rejects(publishBuild(dist, dist), /overlap/);
});
