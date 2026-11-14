'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { isNewerVersion, recordLaunchVersion, macDownloadUrl, checkMacForUpdate, configureWindowsUpdater, startUpdates } = require('../../src/updates');
const { releaseHighlights, updatePrompt } = require('../../src/update-prompt');
const { createUpdateJourney } = require('../../src/update-journey');

test('upgrade milestones persist across launches and confirm only a newer successfully opened version', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { Settings } = require('../../src/settings');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-journey-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'settings.json'), events = [];
  let settings = new Settings(file);
  const journey = createUpdateJourney({ settings, version: '4.0.0.0', report: (event, details) => events.push({ event, ...details }) });
  const updater = new EventEmitter(); updater.quitAndInstall = () => {};
  const control = configureWindowsUpdater({ updater, win: { isDestroyed: () => false }, dialog: { showMessageBox: async () => ({ response: 1 }) }, journey: journey.record });
  updater.emit('update-downloaded', { version: '4.1.0' }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events.map(item => item.stage), ['download-ready', 'later']);
  await control.install(); assert.equal(events.at(-1).stage, 'install-requested');
  assert.equal(new Settings(file).data.updateJourney.targetVersion, '4.1.0');
  settings = new Settings(file);
  const same = createUpdateJourney({ settings, version: '4.0.0.0', report: () => assert.fail('same version is not success') }); same.confirmRunning();
  const next = createUpdateJourney({ settings, version: '4.1.0.0', report: (event, data) => events.push({ event, ...data }) });
  next.confirmRunning(); next.confirmRunning(); assert.equal(events.filter(item => item.stage === 'running').length, 1);
  assert.equal(new Settings(file).data.updateJourney, null); control.dispose();
});
test('permission/download failures retry quietly and stop after a successful retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const app = new EventEmitter(), win = new EventEmitter(), updater = new EventEmitter(); app.isPackaged = true;
  let checks = 0;
  updater.checkForUpdates = async () => {
    if (++checks === 1) { updater.emit('update-available', { version: '4.1.0' }); return { downloadPromise: Promise.reject(Object.assign(new Error('locked'), { code: 'EPERM' })) }; }
  };
  const control = startUpdates({ app, win, updater, platform: 'win32', delayMs: 999999, log: { warn() {} }, dialog: { showMessageBox: () => assert.fail('no error dialog') } }); t.after(control.stop);
  await control.check(); t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve)); assert.equal(checks, 2);
  t.mock.timers.tick(120000); await new Promise(resolve => setImmediate(resolve)); assert.equal(checks, 2);
});

test('the preview launches a visible GUI in isolation and opens the native message with a visible owner', async () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
  const filename = path.resolve(__dirname, '../../tools/preview-update-message.cjs'), script = fs.readFileSync(filename, 'utf8');
  const profile = path.join(os.tmpdir(), 'be-update-preview-fixture'), child = new EventEmitter();
  let spawnOptions;
  const common = { __filename: filename, __dirname: path.dirname(filename), console: { log() {}, error() {} } };
  vm.runInNewContext(script, { ...common, process: { versions: {}, argv: ['node', filename], env: { ELECTRON_RUN_AS_NODE: '1', TEST: 'kept' } },
    require: name => {
      if (name === 'node:fs') return { mkdtempSync: () => profile };
      if (name === 'node:os') return os;
      if (name === 'node:path') return path;
      if (name === 'electron') return 'electron.exe';
      if (name === 'node:child_process') return { spawn: (_exe, _args, options) => { spawnOptions = options; return child; } };
      throw Error('Unexpected preview dependency: ' + name);
    } });
  assert.equal(spawnOptions.windowsHide, false);
  assert.equal(spawnOptions.cwd, profile);
  assert.equal(spawnOptions.env.ELECTRON_RUN_AS_NODE, undefined);
  const steps = []; let owner, finishDialog;
  const app = { setPath: (_key, value) => assert.equal(value, profile), disableHardwareAcceleration() {}, whenReady: async () => {}, quit: () => steps.push('quit'), exit: () => assert.fail('Preview failed') };
  class PreviewWindow extends EventEmitter {
    constructor(options) { super(); owner = this; assert.equal(options.webPreferences.nodeIntegration, false); }
    async loadURL() { steps.push('loaded'); }
    show() { steps.push('shown'); }
    focus() { steps.push('focused'); }
    isDestroyed() { return steps.includes('destroyed'); }
    destroy() { steps.push('destroyed'); this.emit('closed'); }
  }
  vm.runInNewContext(script, { ...common, process: { versions: { electron: 'test' }, argv: ['electron', filename], cwd: () => profile },
    require: name => {
      if (name === 'node:fs') return { readFileSync: () => '- A reason to update.' };
      if (name === 'node:os') return os;
      if (name === 'node:path') return path;
      if (name === '../src/update-prompt') return { updatePrompt };
      if (name === 'electron') return { app, BrowserWindow: PreviewWindow, dialog: { showMessageBox: (parent, options) => {
        assert.equal(parent, owner); assert.deepEqual(steps, ['loaded', 'shown', 'focused']);
        assert.match(options.title, /^PREVIEW/); assert.match(options.detail, /A reason to update/);
        return new Promise(resolve => { finishDialog = resolve; });
      } } };
      throw Error('Unexpected preview dependency: ' + name);
    } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finishDialog, 'function'); finishDialog({ response: 0 });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(steps.includes('destroyed') && steps.includes('quit'), 'Update now in the preview only closes it');
});

test('update prompts show three short target-release benefits without Markdown or installation boilerplate', () => {
  const notes = "## What's new in Babble Expert 3.8.0\n\n- **New celebrations:** 42 shows with [automatic additions](https://example.test).\n- Clearer journal statuses.\n- Copy today's grid and found words.\n- A fourth item.\n\n## Downloads and updates\n- Private installer instructions.";
  const prompt = updatePrompt({ version: '3.8.0', releaseNotes: notes });
  assert.equal(prompt.message, 'Babble Expert 3.8.0 is ready to install');
  assert.match(prompt.detail, /What's new\n• New celebrations: 42 shows with automatic additions\./);
  assert.match(prompt.detail, /• Clearer journal statuses\./);
  assert.doesNotMatch(prompt.detail, /\*\*|https:|fourth|Private installer|Downloads/);
  assert.equal(prompt.detail.split('\n').filter(line => line.startsWith('• ')).length, 3);
  assert.ok(prompt.detail.length < 650, 'the native message stays compact');
  assert.equal(prompt.defaultId, 1); assert.equal(prompt.cancelId, 1);
});

test('HTML feed notes and explicit update highlights produce plain readable benefits', () => {
  const notes = '<h2>What’s new in Babble Expert 3.8.0</h2><ul><li>Long full notes.</li></ul><h3>Update highlights</h3><ul><li><strong>Clearer</strong> &amp; quicker.</li><li>Copy today&#39;s grid.</li><li>New effects\u202e.</li></ul><h2>Downloads</h2><p>DMG instructions.</p><script>bad()</script>';
  assert.deepEqual(releaseHighlights(notes, '3.8.0'), ['Clearer & quicker.', "Copy today's grid.", 'New effects .']);
  assert.doesNotMatch(updatePrompt({ version: '3.8.0', releaseNotes: notes }).detail, /<|>|bad\(|DMG|Long full|\u202e/);
});

test('missing or mismatched release notes never use the installed release as a substitute', () => {
  const releases = [{ version: '3.7.0', note: '- Old features.' }, { version: 'v3.8.0', note: '- New features.' }];
  assert.deepEqual(releaseHighlights(releases, '3.8.0'), ['New features.']);
  assert.deepEqual(releaseHighlights(releases, '3.9.0'), []);
  assert.deepEqual(releaseHighlights("## What's new in Babble Expert 3.7.0\n- Wrong version.", '3.8.0'), []);
  for (const notes of [null, {}, [], '']) {
    const prompt = updatePrompt({ version: '3.8.0', releaseNotes: notes });
    assert.doesNotMatch(prompt.detail, /What's new|Old features/);
    assert.match(prompt.detail, /saves your settings and journal/);
  }
  const long = releaseHighlights('- ' + 'Long benefit '.repeat(5000), '3.8.0');
  assert.ok(long[0].length <= 130); assert.match(long[0], /…$/);
});

test('background transient update failures retry twice quietly on Windows and Mac, and stop on close', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const platform of ['win32', 'darwin']) {
    const app = new EventEmitter(), win = new EventEmitter(), updater = new EventEmitter(), states = [], reports = [];
    app.isPackaged = true; app.getVersion = () => '3.3.0';
    let checks = 0;
    const fail = async () => { checks++; throw Object.assign(new Error('offline'), { code: 'ENOTFOUND' }); };
    updater.checkForUpdates = fail;
    const control = startUpdates({ app, win, updater, platform, fetchImpl: fail, delayMs: 999999,
      onState: state => states.push(state), diagnostic: (...args) => reports.push(args), log: { warn() {} } });
    await control.check();
    assert.equal(reports.length, 0, 'temporary background check failures wait for retries');
    t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(checks, 2);
    t.mock.timers.tick(120000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(checks, 3);
    t.mock.timers.tick(120000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(checks, 3, 'retry budget exhausted');
    assert.equal(reports.length, 1, 'persistent background failure is reported once after retries');
    assert.ok(states.every(state => state.manual === false));
    await control.check();
    win.emit('closed');
    t.mock.timers.tick(120000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(checks, 4, 'close cancels a pending retry');
    assert.equal(reports.length, 1, 'closing does not report an abandoned check');
    control.stop();
  }
});

test('permanent update failures do not retry, and a successful retry cancels further attempts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const app = new EventEmitter(), win = new EventEmitter(), updater = new EventEmitter();
  app.isPackaged = true;
  let checks = 0, code = 'ERR_UPDATER_INVALID_SIGNATURE';
  updater.checkForUpdates = async () => { checks++; if (code) throw Object.assign(new Error('failed'), { code }); };
  const control = startUpdates({ app, win, updater, platform: 'win32', delayMs: 999999, log: { warn() {} } });
  t.after(control.stop);
  await control.check();
  t.mock.timers.tick(150000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 1);
  code = 'ETIMEDOUT'; await control.check(); code = '';
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 3);
  t.mock.timers.tick(120000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 3);
});

test('a recovered background release-feed check stays quiet, but download failures remain reportable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const app = new EventEmitter(), win = new EventEmitter(), updater = new EventEmitter(), reports = [];
  app.isPackaged = true;
  let checks = 0;
  updater.checkForUpdates = async () => { if (++checks === 1) throw Object.assign(new Error('feed unavailable'), { code: 'ERR_UPDATER_INVALID_RELEASE_FEED' }); };
  const control = startUpdates({ app, win, updater, platform: 'win32', delayMs: 999999, log: { warn() {} }, diagnostic: (...args) => reports.push(args) });
  t.after(control.stop);
  await control.check();
  assert.equal(reports.length, 0);
  t.mock.timers.tick(30000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(checks, 2); assert.equal(reports.length, 0);
  updater.checkForUpdates = async () => {
    updater.emit('update-available', { version: '3.7.0' });
    return { downloadPromise: Promise.reject(Object.assign(new Error('offline'), { code: 'ENOTFOUND' })) };
  };
  await control.check();
  assert.equal(reports.length, 1); assert.equal(reports[0][1].reason, 'download');
});

test('automatic checks wait for the local window to load, and closing suppresses in-flight errors', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const app = new EventEmitter(), win = new EventEmitter(), updater = new EventEmitter(), reports = [];
  app.isPackaged = true;
  win.webContents = new EventEmitter(); win.webContents.isLoadingMainFrame = () => true;
  let checks = 0, rejectCheck;
  updater.checkForUpdates = () => { checks++; return new Promise((_resolve, reject) => { rejectCheck = reject; }); };
  const control = startUpdates({ app, win, updater, platform: 'win32', delayMs: 4000, log: { warn() {} }, diagnostic: (...args) => reports.push(args) });
  t.after(control.stop);
  t.mock.timers.tick(10000); assert.equal(checks, 0);
  win.webContents.emit('did-finish-load');
  t.mock.timers.tick(4000); assert.equal(checks, 1);
  win.emit('close'); rejectCheck(new Error('request closed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reports.length, 0);
});

test('an emitted and rejected Windows failure reports once per attempt and keeps the download phase', async () => {
  const updater = new EventEmitter(), reports = [], states = [];
  const error = Object.assign(new Error('private URL'), { statusCode: 503, code: 'HTTP_ERROR_503' });
  updater.checkForUpdates = async () => {
    updater.emit('error', error);
    throw error;
  };
  const control = configureWindowsUpdater({ updater, diagnostic: (_event, data) => reports.push(data), onState: s => states.push(s), log: { warn() {} } });
  try {
    await control.check();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].code, 'ERR_HTTP_503');
    assert.equal(states.at(-1).phase, 'error');
    await control.check();
    assert.equal(reports.length, 2, 'a later retry is a separate incident even if the library reuses its Error');
    updater.checkForUpdates = async () => {
      updater.emit('update-available', { version: '3.4.0' });
      return { downloadPromise: Promise.resolve().then(() => { updater.emit('error', error); throw error; }) };
    };
    await control.check();
    assert.equal(reports.length, 3);
    assert.equal(reports[2].reason, 'download');
    assert.equal(reports[2].targetVersion, '3.4.0');
  } finally { control.dispose(); }
});

test('Mac HTTP update failures preserve a safe status without disclosing the response', async () => {
  const app = new EventEmitter(), win = new EventEmitter(), reports = [];
  app.isPackaged = true;
  const control = startUpdates({ app, win, platform: 'darwin', delayMs: 999999,
    fetchImpl: async () => ({ ok: false, status: 429 }), log: { warn() {} }, diagnostic: (event, data) => reports.push({ event, ...data }) });
  try {
    await control.check({ manual: true });
    assert.deepEqual(reports, [{ event: 'update-failed', component: 'updater', reason: 'check', code: 'ERR_HTTP_429', networkState: 'unknown', service: 'github-api' }]);
  } finally { control.stop(); }
});

test('updater diagnostics distinguish failed checking, downloading and installation', async () => {
  const updater = new EventEmitter(), reports = [];
  updater.checkForUpdates = async () => { throw Object.assign(new Error('private path'), { code: 'ENETUNREACH' }); };
  const control = configureWindowsUpdater({ updater, diagnostic: (event, data) => reports.push({ event, ...data }),
    beforeInstall: async () => { throw Object.assign(new Error('private installation path'), { code: 'EACCES' }); }, log: { warn() {} } });
  await control.check();
  updater.emit('update-available', { version: '3.2.12' });
  updater.emit('error', Object.assign(new Error('private download URL'), { code: 'ERR_UPDATER_INVALID_SIGNATURE' }));
  updater.emit('update-downloaded', { version: '3.2.12' });
  await control.install();
  assert.deepEqual(reports.map(r => r.reason), ['check', 'download', 'install']);
  assert.equal(reports[2].targetVersion, '3.2.12');
  assert.doesNotMatch(JSON.stringify(reports), /private/);
  control.dispose();
});

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
  updater.emit('update-downloaded', { version: '3.3.0', releaseNotes: "## What's new in Babble Expert 3.3.0\n- A reason to update." });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(prompt.buttons, ['Update now', 'Later']);
  assert.equal(prompt.defaultId, 1, 'typing Enter must not accidentally restart the app');
  assert.match(prompt.detail, /A reason to update/);
  assert.match(prompt.detail, /saves your settings and journal/);
  assert.match(prompt.detail, /Please wait for it to reopen/);
  assert.match(prompt.detail, /silently when you close Expert, without reopening/);
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


test('offline updater errors produce no Discord reports, warning logs or visible errors and retries still run', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval']});const app=new EventEmitter(),win=new EventEmitter(),updater=new EventEmitter();app.isPackaged=true;
  const reports=[],warnings=[],states=[];let calls=0,online=false;
  updater.checkForUpdates=async()=>{calls++;throw Object.assign(new Error('net::ERR_NAME_NOT_RESOLVED https://github.com/private'),{code:'ERR_NAME_NOT_RESOLVED'});};
  const control=startUpdates({app,win,updater,platform:'win32',delayMs:999999,isOnline:()=>online,log:{warn:(...args)=>warnings.push(args)},diagnostic:(...args)=>reports.push(args),onState:state=>states.push(state)});t.after(control.stop);
  await control.check({manual:true});assert.equal(reports.length,0);assert.equal(warnings.length,0);assert.equal(states.at(-1).phase,'idle');
  t.mock.timers.tick(30000);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);assert.equal(reports.length,0);
  online=true;await control.check({manual:true});assert.equal(reports.length,1);assert.equal(reports[0][1].service,'github-releases');assert.equal(reports[0][1].networkState,'online-hint');
  assert.doesNotMatch(JSON.stringify(reports),/private|https:/);
});
