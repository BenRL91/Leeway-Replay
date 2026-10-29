'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = ['core.js', 'background.js', 'ui.js', 'content.js', 'styles.css', 'library.html', 'library.js', 'brand-mark.svg'];
for (const target of ['chromium', 'firefox']) {
  const dir = path.join(root, 'dist', target);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const output = structuredClone(manifest);
  if (target === 'firefox') {
    delete output.minimum_chrome_version;
    output.background = { scripts: ['core.js', 'background.js'] };
    output.browser_specific_settings = { gecko: { id: 'yoututor@leewaypb.com', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } } };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(output, null, 2) + '\n');
  for (const file of files) fs.copyFileSync(path.join(root, file==='brand-mark.svg' ? '../app/web/brand-mark.svg' : ['core.js','ui.js','styles.css'].includes(file) ? '../app/'+file : file), path.join(dir, file));
  fs.appendFileSync(path.join(dir,'styles.css'), '\n'+fs.readFileSync(path.join(root,'../app/palette.css'),'utf8'));
  console.log(`Built dist/${target}`);
}
