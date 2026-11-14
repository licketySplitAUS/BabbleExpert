'use strict';
// The browser repository owns the shared source. Bundle it for legacy pages and
// copy the same self-contained renderer into Expert for offline use/injection.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sourceRoot = process.env.SELF_SERVE_CLUES_DIR || path.resolve(__dirname, '../../../GitHubSelfServe/SelfServeClues');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(sourceRoot, 'tools/build-celebrations.mjs'), ...(process.argv.includes('--check') ? ['--check'] : [])], { stdio: 'inherit' });
const source = fs.readFileSync(path.join(sourceRoot, 'public/celebration-effects.js'), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
const browserPath = path.join(sourceRoot, 'public/clues-celebration.js');
let browser = fs.readFileSync(browserPath, 'utf8').replace(/\r\n/g, '\n');
const start = '/* BEGIN SHARED CELEBRATION EFFECTS */', end = '/* END SHARED CELEBRATION EFFECTS */';
const bundle = start + '\n' + source + '\n' + end;
if (browser.includes(start)) browser = browser.slice(0, browser.indexOf(start)) + bundle + browser.slice(browser.indexOf(end) + end.length);
else browser = browser.replace('function installCluesCelebration', bundle + '\n\nfunction installCluesCelebration');
const outputs = [[browserPath, browser], [path.join(root, 'src/experiments/celebrations.js'), source + '\n\nif (typeof module !== \'undefined\' && module.exports) module.exports = { createBabbleCelebration };\n']];
for (const [file, content] of outputs) {
  if (process.argv.includes('--check')) { if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content) throw Error('Shared celebration copy differs: ' + file); }
  else fs.writeFileSync(file, content);
}
console.log('Shared celebration renderers match.');


