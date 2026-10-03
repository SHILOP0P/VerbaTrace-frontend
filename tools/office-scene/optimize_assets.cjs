/** Offline build: node tools/office-scene/optimize_assets.cjs <raw-dir> <baked-dir>.
 * Tools live in .cache/asset-tools; the application has no new dependency.
 * Requires glTF Transform 4.5.1, sharp and portable KTX-Software in .cache/ktx.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const dependencies = path.join(root, '.cache/asset-tools/node_modules');
const cli = path.join(dependencies, '@gltf-transform/cli/bin/cli.js');
const sharp = require(path.join(dependencies, 'sharp'));
const raw = path.resolve(process.argv[2]);
const baked = path.resolve(process.argv[3] || raw);
const output = path.join(raw, 'web');
fs.mkdirSync(output, { recursive: true });
const environment = { ...process.env, PATH: path.join(root, '.cache/ktx/bin') + path.delimiter + process.env.PATH };
function step(command, input, filename, options = []) {
  const target = path.join(output, filename);
  const result = spawnSync(process.execPath, [cli, command, input, target, ...options], { env: environment, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
  return target;
}
(async () => {
  const source = path.join(raw, 'office.glb');
  let model = step('dedup', source, 'office-dedup.glb');
  model = step('uastc', model, 'office-normals.glb', ['--slots', 'normalTexture', '--level', '2', '--rdo', '--zstd', '18', '--jobs', '2']);
  model = step('etc1s', model, 'office-color.glb', ['--slots', 'baseColorTexture', '--quality', '220', '--compression', '2', '--jobs', '2']);
  model = step('etc1s', model, 'office-textures.glb', ['--slots', 'metallicRoughnessTexture', '--quality', '220', '--compression', '2', '--jobs', '2']);
  // Use the highest ETC1S quality for the 4K sampling texture. Unrestricted
  // UASTC added 9.37MB for this upsampled source without captured new detail.
  model = step('etc1s', model, 'office-emissive.glb', ['--slots', 'emissiveTexture', '--quality', '255', '--compression', '4', '--jobs', '2']);
  model = step('meshopt', model, 'office.glb', ['--quantize-position', '16', '--quantize-texcoord', '14']);
  // The CLI can exit successfully after an individual texture encoder failed.
  // Inspect the result before it can replace the public model.
  const binary = fs.readFileSync(model);
  const document = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString());
  const cityMaterial = document.materials.find(material => material.name === 'exterior_city_unlit');
  const cityTexture = document.textures[cityMaterial?.emissiveTexture?.index];
  const cityImage = document.images[cityTexture?.extensions?.KHR_texture_basisu?.source];
  if (cityImage?.mimeType !== 'image/ktx2') throw Error('City texture encoding failed; refusing uncompressed output');
  for (const floor of [1, 2]) {
    // Bake grain is filtered offline; minimum fill matches the runtime's room
    // ambience. No camera-dependent exposure or dynamic floor shadow pass.
    await sharp(path.join(baked, `floor${floor}_light.png`)).blur(2.4).linear(.8, 24)
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(path.join(output, `floor${floor}_light.jpg`));
  }
  const report = { sourceBytes: fs.statSync(source).size, runtimeBytes: fs.statSync(model).size,
    textureFormats: { normal: 'KTX2 UASTC', colourAndRoughness: 'KTX2 ETC1S', emissive: 'KTX2 ETC1S quality 255', floor: 'JPEG irradiance / UV1' },
    positionBits: 16, texcoordBits: 14, lightingSource: baked,
    floorFiltering: { blurPixels: 2.4, gain: .8, fillSRGB: 24 } };
  report.exterior = { source: 'ImageGen-restored native 1774x887 city; Lanczos3 resampling for GPU texture',
    sourcePixels: [1774, 887], texturePixels: [4096, 2048], horizontalDegrees: 360, triangles: 3968,
    compressedTextureBytes: document.bufferViews[cityImage.bufferView].byteLength,
    lighting: 'unlit, no shadow/bake/IBL', sunDirection: 'north exterior windows',
    uvVerticalCalibration: .1, groundOrProps: 0 };
  fs.writeFileSync(path.join(output, 'asset-build.json'), JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
