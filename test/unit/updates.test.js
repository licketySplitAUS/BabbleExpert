'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { isNewerVersion, macDownloadUrl, checkMacForUpdate, configureWindowsUpdater, startUpdates } = require('../../src/updates');

test('version comparison accepts release tags and only reports newer versions', () => {
  assert.equal(isNewerVersion('v3.1.0', '3.0.0'), true);
  assert.equal(isNewerVersion('v3.1.0', '3.1.0'), false);
  assert.equal(isNewerVersion('v3.0.9', '3.1.0'), false);
  assert.equal(isNewerVersion('not-a-version', '3.0.0'), false);
});

test('mac updater finds the named DMG and falls back to the release page', () => {
  assert.equal(macDownloadUrl({ assets: [{ name: 'BabbleExpert-macOS.dmg', browser_download_url: 'dmg-url' }] }), 'dmg-url');
  assert.equal(macDownloadUrl({ assets: [], html_url: 'release-url' }), 'release-url');
});

test('mac updater prompts only for a newer release and opens its DMG', async () => {
  const opened = [], prompts = [];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ tag_name: 'v3.2.0', body: 'Useful improvements.', html_url: 'release-url', assets: [{ name: 'BabbleExpert-macOS.dmg', browser_download_url: 'dmg-url' }] }) });
  const result = await checkMacForUpdate({
    app: { getVersion: () => '3.1.0' }, fetchImpl,
    dialog: { showMessageBox: async (_win, options) => { prompts.push(options); return { response: 0 }; } },
    shell: { openExternal: async url => opened.push(url) }, win: {}
  });
  assert.deepEqual(result, { available: true, opened: true, version: '3.2.0' });
  assert.equal(prompts.length, 1); assert.match(prompts[0].detail, /replace Babble Expert in Applications/);
  assert.deepEqual(opened, ['dmg-url']);

  const current = await checkMacForUpdate({
    app: { getVersion: () => '3.2.0' }, fetchImpl,
    dialog: { showMessageBox: async () => { throw new Error('should not prompt'); } },
    shell: {}, win: {}
  });
  assert.deepEqual(current, { available: false });
});

test('Windows updater downloads silently and can defer installation until exit', async () => {
  class FakeUpdater extends EventEmitter { checkForUpdates() { this.checked = true; return Promise.resolve(); } }
  const updater = new FakeUpdater(), messages = [];
  let prompts = 0;
  const control = configureWindowsUpdater({ updater, status: text => messages.push(text), dialog: { showMessageBox: async () => { prompts++; return { response: 1 }; } } });
  await control.check();
  assert.equal(updater.checked, true);
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.allowDowngrade, false);
  updater.emit('update-downloaded', { version: '3.2.0' });
  updater.emit('update-downloaded', { version: '3.2.0' });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(messages[0], /install when you close/);
  assert.equal(prompts, 1, 'do not repeat the prompt for a downloaded version');
  updater.checked = false;
  await control.check();
  assert.equal(updater.checked, false, 'do not download again while an update is ready');
  control.dispose();
});

test('Update now saves app state before silently installing and restarting', async () => {
  const updater = new EventEmitter(), steps = [];
  updater.quitAndInstall = (...args) => steps.push(['install', ...args]);
  let prompt;
  const control = configureWindowsUpdater({
    updater, beforeInstall: async () => { steps.push(['save']); },
    dialog: { showMessageBox: async (_win, options) => { prompt = options; return { response: 0 }; } }
  });
  updater.emit('update-downloaded', { version: '3.3.0' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(prompt.buttons, ['Update now', 'Later']);
  assert.equal(prompt.defaultId, 1, 'typing Enter must not accidentally restart the app');
  assert.deepEqual(steps, [['save'], ['install', true, true]]);
  assert.equal(updater.autoRunAppAfterInstall, true);
  control.dispose();
});

test('a deferred downloaded update can still be installed from the persistent action', async () => {
  const updater = new EventEmitter(), states = [], installs = [];
  updater.quitAndInstall = (...args) => installs.push(args);
  const control = configureWindowsUpdater({ updater, onState: state => states.push(state), dialog: { showMessageBox: async () => ({ response: 1 }) } });
  updater.emit('update-downloaded', { version: '3.4.0' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states.at(-1).phase, 'ready');
  assert.deepEqual(installs, []);
  await control.install();
  await control.install();
  assert.deepEqual(installs, [[true, true]], 'double clicks cannot start two installers');
  control.dispose();
});

test('Windows checks do not overlap a download and retry after errors', async () => {
  let checks = 0, finishDownload;
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => {
    checks++;
    return { downloadPromise: new Promise(resolve => { finishDownload = resolve; }) };
  };
  const control = configureWindowsUpdater({ updater, log: { warn() {} } });
  const first = control.check();
  await new Promise(resolve => setImmediate(resolve));
  await control.check();
  assert.equal(checks, 1);
  finishDownload(); await first;
  updater.checkForUpdates = () => { checks++; throw new Error('offline'); };
  await control.check();
  await control.check();
  assert.equal(checks, 3, 'a failed check must not block future checks');
  control.dispose();
});

test('packaged updater checks at startup, periodically and on overdue focus, then stops on close', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const app = new EventEmitter(), win = new EventEmitter(), updater = new EventEmitter();
  app.isPackaged = true;
  let checks = 0;
  updater.checkForUpdates = async () => { checks++; };
  const control = startUpdates({ app, win, updater, platform: 'win32', delayMs: 10, intervalMs: 100 });
  t.after(() => control.stop());
  assert.equal(checks, 0);
  t.mock.timers.tick(10);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 1);
  win.emit('focus');
  assert.equal(checks, 1, 'frequent focus does not spam update checks');
  t.mock.timers.tick(100);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 2);
  t.mock.timers.setTime(Date.now() + 101);
  win.emit('focus');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 3, 'returning after sleep checks if overdue');
  win.emit('closed');
  t.mock.timers.tick(1000);
  win.emit('focus');
  await control.check();
  assert.equal(checks, 3);
});

test('Mac periodic checks do not repeat the same release prompt', async () => {
  const promptedVersions = new Set();
  let prompts = 0;
  const options = {
    app: { getVersion: () => '3.2.0' }, promptedVersions,
    fetchImpl: async () => ({ ok: true, json: async () => ({ tag_name: 'v3.3.0' }) }),
    dialog: { showMessageBox: async () => { prompts++; return { response: 1 }; } }, shell: {}, win: {}
  };
  await checkMacForUpdate(options);
  await checkMacForUpdate(options);
  assert.equal(prompts, 1);
});

test('update checks do not run in development builds', () => {
  assert.equal(startUpdates({ app: { isPackaged: false }, platform: 'win32' }), null);
});
