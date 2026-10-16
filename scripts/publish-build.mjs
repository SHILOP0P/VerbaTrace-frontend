import { copyFile, lstat, mkdir, readdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve, sep } from 'node:path';

const hashedAsset = /-[\w-]{8}\.(?:js|mjs|css|woff2?|png|jpg|svg)(?:\.(?:br|gz))?$/;

async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Build output must not contain symlinks');
    if (entry.isDirectory()) result.push(...await files(root, relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}
async function ensureDirectory(root, path) {
	if (path === root) {
		const info = await lstat(root);
		if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unexpected build root');
		return;
	}
  const parent = dirname(path);
  if (parent !== root) await ensureDirectory(root, parent);
  const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Unexpected directory in build destination');
  if (!info) await mkdir(path);
}

/** Assets first, entry documents last; never delete URLs used by open tabs. */
export async function publishBuild(stage, destination, { onPublished } = {}) {
  stage = await realpath(stage); destination = resolve(destination);
  if (stage === destination || stage.startsWith(destination + sep) || destination.startsWith(stage + sep)) throw new Error('Build directories overlap');
  const output = await files(stage);
  if (!output.includes('app.html') || !output.includes('index.html')) throw new Error('Build entry documents are missing');
  await mkdir(dirname(destination), { recursive: true });
  await ensureDirectory(dirname(destination), destination);
  const root = await realpath(destination);
  // Check immutable filenames before modifying any served entry.
  for (const relative of output.filter(file => hashedAsset.test(file))) {
    const existing = join(root, relative);
    const info = await lstat(existing).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (!info) continue;
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unexpected immutable asset');
    if (!(await readFile(existing)).equals(await readFile(join(stage, relative)))) throw new Error(`Immutable asset changed: ${relative}`);
  }
  output.sort((a, b) => Number(a.endsWith('.html')) - Number(b.endsWith('.html')) || a.localeCompare(b));
  for (const relative of output) {
    const target = join(root, relative);
    await ensureDirectory(root, dirname(target));
    const existing = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (existing?.isSymbolicLink()) throw new Error('Unexpected file link in build destination');
    if (existing && hashedAsset.test(relative)) continue;
    const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
    try {
      await copyFile(join(stage, relative), temporary, constants.COPYFILE_EXCL);
      await rename(temporary, target);
    } finally { await rm(temporary, { force: true }); }
    await onPublished?.(relative);
  }
}
