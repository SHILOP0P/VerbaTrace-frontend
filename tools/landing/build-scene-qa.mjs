import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const asset = `landing-scene-qa-${Date.now()}.js`;
await build({entryPoints:['tools/landing/render-scene.tsx'],bundle:true,format:'esm',outfile:`dist/assets/${asset}`,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
await writeFile('dist/assets/landing-scene-qa.html',`<!doctype html><html lang="ru"><meta charset="UTF-8"><meta name="robots" content="noindex"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}.c-canvas-container{width:100%;height:100%;position:relative}.c-scene-poster{position:absolute;inset:0}.c-scene-preview{width:100%;height:100%;display:block;background:transparent}.c-scene-poster span{display:none}.c-canvas-container .c-scene-poster{display:none}</style><div id="root"></div><script type="module" src="/assets/${asset}"></script></html>`);
