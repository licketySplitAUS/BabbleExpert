'use strict';
// Real process restarts share one isolated profile; production user data is never used.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'be-highlights-restarts-'));
for (const stage of ['first-install', 'upgrade-close', 'development', 'upgrade-ok', 'acknowledged', 'downgrade', 'return', 'next-update']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run.js'), 'update-highlights-main.js', '--no-sandbox', `--highlights-stage=${stage}`, `--highlights-profile=${profile}`],
    { stdio: 'inherit', windowsHide: true, timeout: 40000 });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('PASS: update highlights across eight app launches, acknowledgement, offline content, development, downgrade and next update.');
