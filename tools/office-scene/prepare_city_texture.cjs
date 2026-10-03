// Texture sampling preparation after the native ImageGen restoration.
// Resampling does not add captured detail: the native source is 1774 x 887.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const sharp = require(path.join(root, '.cache/asset-tools/node_modules/sharp'));
sharp(path.join(__dirname, 'materials/exterior-user-skyscraper-enhanced.png'))
  .resize(4096, 2048, { kernel: 'lanczos3' })
  .sharpen({ sigma: .8, m1: .4, m2: 1.4, x1: 3, y2: 6, y3: 6 })
  .png()
  .toFile(path.join(__dirname, 'materials/exterior-user-skyscraper-runtime.png'))
  .then(info => console.log(JSON.stringify(info)))
  .catch(error => { console.error(error); process.exitCode = 1; });
