'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { isNewerVersion, recordLaunchVersion, macDownloadUrl, checkMacForUpdate, configureWindowsUpdater, startUpdates } = require('../../src/updates');

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
  assert.match(messages[0], /install silently when you close/);
  assert.equal(prompts, 1, 'do not repeat the prompt for a downloaded version');
  updater.checked = false;
  await control.check();
  assert.equal(updater.checked, false, 'do not download again while an update is ready');
  control.dispose();
});

test('Update now saves app state before showing installer progress and restarting', async () => {
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
  assert.match(prompt.detail, /installer will show progress/);
  assert.match(prompt.detail, /silently without reopening/);
  assert.match(prompt.detail, /desktop shortcut stays in place/);
  assert.deepEqual(steps, [['save'], ['install', false, true]]);
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
  assert.deepEqual(installs, [[false, true]], 'double clicks cannot start two installers');
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

test('launch tracking confirms an upgrade once without requiring usage sharing', () => {
  const settings = { data: { lastRunVersion: '3.2.1.0', usageSharing: false }, patch(p) { Object.assign(this.data, p); }, flush() { this.flushed = true; } };
  assert.deepEqual(recordLaunchVersion(settings, '3.2.2.0'), { version: '3.2.2.0', updated: true });
  assert.equal(settings.flushed, true);
  assert.equal(recordLaunchVersion(settings, '3.2.2.0'), null);
  assert.equal(recordLaunchVersion(settings, '3.2.2'), null, 'three- and four-part display versions refer to the same release');
});

test('launch tracking handles first run, migration and downgrade truthfully', () => {
  const make = data => ({ data, patch(p) { Object.assign(this.data, p); }, flush() {} });
  assert.deepEqual(recordLaunchVersion(make({}), '3.2.2.0'), { version: '3.2.2.0', updated: false });
  assert.deepEqual(recordLaunchVersion(make({ telemetryVersion: '3.2.1.0' }), '3.2.2.0'), { version: '3.2.2.0', updated: true });
  assert.deepEqual(recordLaunchVersion(make({ lastRunVersion: '3.3.0' }), '3.2.2.0'), { version: '3.2.2.0', updated: false });
  assert.equal(recordLaunchVersion(make({}), 'invalid'), null);
});

test('manual Windows checks visibly promote an ongoing background check and report the installed version', async () => {
  const app = new EventEmitter(), win = new EventEmitter(), updater = new EventEmitter(), states = [];
  app.isPackaged = true; app.getVersion = () => '3.2.1';
  let finish;
  updater.checkForUpdates = () => new Promise(resolve => { finish = resolve; });
  const control = startUpdates({ app, win, updater, platform: 'win32', delayMs: 999999, onState: s => states.push(s) });
  try {
    const pending = control.check();
    assert.equal(states.at(-1).manual, false);
    await control.check({ manual: true });
    assert.equal(states.at(-1).phase, 'checking');
    assert.equal(states.at(-1).manual, true);
    finish(); await pending;
    assert.deepEqual(states.at(-1), { phase: 'current', manual: true, currentVersion: '3.2.1' });
    updater.checkForUpdates = async () => {};
    await control.check();
    assert.equal(states.at(-1).manual, false, 'later background checks do not reuse manual feedback');
  } finally { control.stop(); }
});

test('an emitted Windows error is not overwritten with an up-to-date result', async () => {
  const updater = new EventEmitter(), states = [];
  updater.checkForUpdates = async () => { updater.emit('error', new Error('offline')); };
  const control = configureWindowsUpdater({ updater, onState: s => states.push(s), log: { warn() {} } });
  await control.check();
  assert.equal(states.at(-1).phase, 'error');
  control.dispose();
});

test('download progress is bounded and manual checks of a ready update do not start another download', async () => {
  const updater = new EventEmitter(), states = [];
  const control = configureWindowsUpdater({ updater, onState: s => states.push(s) });
  updater.emit('update-available', { version: '3.2.2' });
  updater.emit('download-progress', { percent: 42.7 });
  assert.deepEqual(states.at(-1), { phase: 'downloading', version: '3.2.2', percent: 42 });
  updater.emit('download-progress', { percent: 120 });
  assert.equal(states.at(-1).percent, 100);
  updater.emit('update-downloaded', { version: '3.2.2' });
  await control.check();
  assert.deepEqual(states.at(-1), { phase: 'ready', version: '3.2.2' });
  control.dispose();
  assert.equal(updater.listenerCount('download-progress'), 0);
});

test('manual Mac checks report current and failed results while background results stay quiet', async () => {
  const app = new EventEmitter(), win = new EventEmitter(), states = [];
  app.isPackaged = true; app.getVersion = () => '3.2.1';
  let fail = false;
  const control = startUpdates({ app, win, platform: 'darwin', delayMs: 999999, onState: s => states.push(s), log: { warn() {} }, fetchImpl: async () => {
    if (fail) throw new Error('offline');
    return { ok: true, json: async () => ({ tag_name: 'v3.2.1' }) };
  } });
  try {
    await control.check({ manual: true });
    assert.equal(states.at(-1).phase, 'current'); assert.equal(states.at(-1).manual, true);
    fail = true;
    await control.check({ manual: true });
    assert.equal(states.at(-1).phase, 'error'); assert.equal(states.at(-1).manual, true);
    await control.check();
    assert.equal(states.at(-1).manual, false);
  } finally { control.stop(); }
});

test('failed installation preparation leaves a clear message and allows retry', async () => {
  const updater = new EventEmitter(), states = [], installs = [];
  let fail = true;
  updater.quitAndInstall = (...args) => installs.push(args);
  const control = configureWindowsUpdater({ updater, onState: s => states.push(s), beforeInstall: async () => { if (fail) throw new Error('save failed'); }, log: { warn() {} } });
  updater.emit('update-downloaded', { version: '3.2.2' });
  await control.install();
  assert.equal(states.at(-1).phase, 'ready');
  assert.match(states.at(-1).message, /Installation could not start/);
  assert.deepEqual(installs, []);
  fail = false;
  await control.install();
  assert.deepEqual(installs, [[false, true]]);
  control.dispose();
});
