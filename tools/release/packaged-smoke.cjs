'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const binary = path.resolve(process.argv[2] || '');
const profile = process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(os.tmpdir(), 'be-smoke-'));
fs.mkdirSync(profile, { recursive: true });
if (!fs.existsSync(path.join(profile, 'settings.json'))) fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ yellow: true, usageSharing: false, lastRunVersion: '3.2.11' }));
const launch = args => new Promise((resolve, reject) => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(binary, ['--smoke-test', '--smoke-profile=' + profile, ...args], { env, windowsHide: true, stdio: 'ignore' });
  const timer = setTimeout(() => { child.kill(); reject(Error('Packaged app timed out')); }, 45000);
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve(child.pid) : reject(Error('Packaged app exited ' + code)); });
});
(async () => {
  // Hold the owner until all duplicate launches have been received.
  const primary = launch(['--smoke-expect=3']);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await Promise.all([launch([]), launch([]), launch([])]);
  const pid = await primary;
  const first = JSON.parse(fs.readFileSync(path.join(profile, 'smoke-result.json')));
  assert.equal(first.pid, pid); assert.equal(first.ok, true); assert.equal(first.activations, 3);
  await launch([]);
  const second = JSON.parse(fs.readFileSync(path.join(profile, 'smoke-result.json')));
  assert.equal(second.ok, true); assert.equal(second.cookieRecovered, true); assert.equal(second.yellow, true);
  assert.equal(second.version, require('../../package.json').build.buildVersion);
  assert.equal(second.tourBundled, false);
  console.log('PASS packaged startup, rapid duplicate launches, tour excluded, restart, settings and cookie persistence. Profile: ' + profile);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
