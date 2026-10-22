'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalBabbleUrl, resetSiteData, browserToolsTemplate } = require('../../src/browser-tools');
const { optionsTemplate } = require('../../src/menus');
const { DEFAULTS } = require('../../src/settings');

test('Options exposes the browser tools supplied by the app', () => {
  const tools = [{ label: 'Babble', submenu: [{ label: 'Back', enabled: false }] }];
  assert.equal(optionsTemplate(DEFAULTS, () => {}, { browserTools: tools }).find(x => x.label === 'Browser tools').submenu, tools);
});

test('Babble links use the existing HTTPS hostname and retain the destination', () => {
  assert.equal(canonicalBabbleUrl('http://www.playbabble.com/log_in?return_url=%2F#here'), 'https://playbabble.com/log_in?return_url=%2F#here');
  for (const url of ['https://playbabble.com.evil.test/', 'https://ironsudoku.com/', 'file:///playbabble.com', 'https://www.playbabble.com:444/', 'invalid']) assert.equal(canonicalBabbleUrl(url), url);
});

test('reset removes applicable cookies without clearing sibling clue-site cookies', async () => {
  const removed = [], cleared = [];
  const wc = { session: {
    cookies: { get: async () => [
      { domain: 'selfserve.r46.me', hostOnly: true, name: 'login', path: '/', secure: true },
      { domain: 'r46.me', hostOnly: true, name: 'original-clues', path: '/' },
      { domain: '.r46.me', hostOnly: false, name: 'shared', path: '/game', secure: true },
      { domain: 'playbabble.com', hostOnly: true, name: 'babble', path: '/' }
    ], remove: async (...args) => removed.push(args), flushStore: async () => {} },
    clearData: async options => cleared.push(options)
  }, isDestroyed: () => false, getURL: () => 'https://selfserve.r46.me/', executeJavaScript: async () => {} };
  await resetSiteData(wc, 'https://selfserve.r46.me');
  assert.deepEqual(removed, [['https://selfserve.r46.me/', 'login'], ['https://selfserve.r46.me/game', 'shared']]);
  assert.deepEqual(cleared[0].origins, ['https://selfserve.r46.me']);
  assert.ok(!cleared[0].dataTypes.includes('cookies'));
});

test('cancelled reset and a page changed during confirmation never clear data', async () => {
  let url = 'https://playbabble.com/', clears = 0, response = 0;
  const wc = { getURL: () => url, navigationHistory: { canGoBack: () => false, canGoForward: () => false },
    isDestroyed: () => false, session: { clearData: async () => clears++ } };
  const panes = [{ label: 'Babble', wc, sessionLabel: 'shared' }];
  const dialog = { showMessageBox: async () => { if (response === 1) url = 'https://ironsudoku.com/'; return { response }; } };
  const reset = () => browserToolsTemplate({ panes, dialog, status: () => {} })[0].submenu.find(x => x.label?.startsWith('Reset'));
  await reset().click();
  response = 1;
  await reset().click();
  assert.equal(clears, 0);
});
