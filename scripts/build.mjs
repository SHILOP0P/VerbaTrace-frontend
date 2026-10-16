import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publishBuild } from './publish-build.mjs';

const projectDir = fileURLToPath(new URL('../', import.meta.url));
function run(binary, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [join(projectDir, 'node_modules', binary), ...args], { cwd: projectDir, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolveRun() : reject(new Error(`Build command failed (${code}): ${binary}`)));
  });
}
export async function build() {
  await run('typescript/bin/tsc', ['--noEmit']);
  await run('typescript/bin/tsc', ['-p', 'tsconfig.node.json']);
  const stage = await mkdtemp(join(projectDir, '.build-'));
  try {
    // The running server keeps serving the previous complete version.
    await run('vite/bin/vite.js', ['build', '--outDir', stage]);
    await publishBuild(stage, join(projectDir, 'dist'));
    console.log('Published complete build; previous hashed assets retained.');
  } finally {
    const stagePath = await realpath(stage), rootPath = await realpath(projectDir);
    if (dirname(stagePath) !== rootPath || !basename(stagePath).startsWith('.build-')) throw new Error('Unexpected build staging path');
    await rm(stagePath, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  build().catch(error => { console.error(error.message); process.exitCode = 1; });
}
