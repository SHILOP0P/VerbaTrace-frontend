import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/** Write compressed representations of the final production files. */
export function compressedAssets(): Plugin {
  let outDir = "";
  return {
    name: "compressed-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    // Vite substitutes preload references in generateBundle; use final output.
    writeBundle(_options, bundle) {
      const sources = Object.values(bundle).filter(output => /\.(?:js|css|mjs)$/.test(output.fileName))
        .map(output => ({ fileName: output.fileName, bytes: Buffer.from(output.type === "chunk" ? output.code : output.source) }));
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
