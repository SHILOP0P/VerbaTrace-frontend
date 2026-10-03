import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/** Write compressed representations of the final production files. */
export function compressedAssets(): Plugin {
  let publicDir = "";
  let outDir = "";
  return {
    name: "compressed-assets",
    configResolved(config) {
      publicDir = config.publicDir;
      outDir = resolve(config.root, config.build.outDir);
    },
    // Vite substitutes preload references in generateBundle; use final output.
    writeBundle(_options, bundle) {
      const sources = Object.values(bundle).filter(output => /\.(?:js|css|mjs)$/.test(output.fileName))
        .map(output => ({ fileName: output.fileName, bytes: Buffer.from(output.type === "chunk" ? output.code : output.source) }));
      for (const directory of ["assets/scene", "basis", "draco/gltf"]) {
        const folder = resolve(publicDir, directory);
        if (!existsSync(folder)) continue;
        for (const file of readdirSync(folder)) {
          if (/\.(?:glb|json|wasm|js)$/.test(file)) sources.push({ fileName: `${directory}/${file}`, bytes: readFileSync(resolve(folder, file)) });
        }
      }
      for (const { fileName, bytes } of sources) {
        if (bytes.length < 1024) continue;
        writeFileSync(resolve(outDir, `${fileName}.gz`), gzipSync(bytes, { level: 9 }));
        writeFileSync(resolve(outDir, `${fileName}.br`), brotliCompressSync(bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 9 }
        }));
      }
    }
  };
}
