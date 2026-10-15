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

test('Windows updater downloads silently and installs when the app exits', async () => {
  class FakeUpdater extends EventEmitter { checkForUpdates() { this.checked = true; return Promise.resolve(); } }
  const updater = new FakeUpdater(), messages = [];
  await configureWindowsUpdater({ updater, status: text => messages.push(text) });
  assert.equal(updater.checked, true);
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.allowDowngrade, false);
  updater.emit('update-downloaded', { version: '3.2.0' });
  assert.match(messages[0], /install when you close/);
});

test('update checks do not run in development builds', () => {
  assert.equal(startUpdates({ app: { isPackaged: false }, platform: 'win32' }), null);
});
