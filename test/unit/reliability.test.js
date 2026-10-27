'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Engine } = require('../../src/engine');
const { allowedPage, executeBounded } = require('../../src/page-runtime');
const { withDeadline } = require('../../src/async');
const { createDiagnostics, exceptionDetails } = require('../../src/diagnostics');
const { rememberLocalWindow, trustedLocal, loadLocalWindow } = require('../../src/local-window');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

test('bulk transfer stops old words after both panes advance to a new matching puzzle', async () => {
  let release, calls = 0;
  const held = new Promise(resolve => { release = resolve; });
  const e = new Engine({ pace: 0, pages: { babble: { words: async () => [], addWord: async () => { calls++; await held; return 'Last word added'; } }, clues: { getAllWords: async () => ['alpha', 'bravo'] } } });
  e._set({ ready: true, cluesOk: true, puzzleMatch: true, puzzleId: 'old', gridLetters: 'A'.repeat(25) });
  const operation = e.sendToBabble(); await new Promise(resolve => setImmediate(resolve));
  e._set({ puzzleId: 'new', gridLetters: 'B'.repeat(25), puzzleMatch: true }); release(); await operation;
  assert.equal(calls, 1); assert.equal(e.state.busy, false);
});
test('busy update preparation times out and removes its idle listener', async () => {
  const e = new Engine({ pages: {} }); e._set({ busy: true });
  await assert.rejects(e.whenIdle(5), /still being processed/);
  assert.equal(e.listenerCount('state'), 0);
});
test('page boundary accepts exact HTTPS origins and only explicitly enabled local fixtures', () => {
  for (const url of ['http://playbabble.com', 'https://playbabble.com:8080', 'https://user:pass@playbabble.com', 'https://playbabble.com.evil.test']) assert.equal(allowedPage(url, ['playbabble.com']), false);
  assert.equal(allowedPage('https://playbabble.com/game', ['playbabble.com']), true);
  assert.equal(allowedPage('http://localhost:3000', ['localhost']), false);
  assert.equal(allowedPage('http://localhost:3000', ['localhost'], true), true);
});
test('renderer timeout releases caller; navigation cancels work and late results cannot complete twice', async () => {
  const wc = Object.assign(new EventEmitter(), { getURL: () => 'https://playbabble.com/', isDestroyed: () => false, executeJavaScript: () => new Promise(() => {}) });
  await assert.rejects(executeBounded(wc, '', { timeoutMs: 5 }), /timed out/);
  let finish; wc.executeJavaScript = () => new Promise(resolve => { finish = resolve; });
  const operation = executeBounded(wc, ''); wc.emit('did-start-navigation', {}, 'https://playbabble.com/new', false, true);
  await assert.rejects(operation, /changed/); finish('late');
  assert.equal(wc.listenerCount('destroyed'), 0);
});
test('request deadlines cancel transports and permit another attempt', async () => {
  await assert.rejects(withDeadline(() => new Promise(() => {}), 5), /timed out/);
  assert.equal(await withDeadline(async () => 42, 50), 42);
  const abort = new AbortController(); const task = withDeadline(() => new Promise(() => {}), 1000, abort.signal); abort.abort();
  await assert.rejects(task, /cancelled/);
});
test('critical diagnostics displace old warnings and retain safe exception locations', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-critical-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = { event: 'load-slow', component: 'clues', anonymousId: 'BE-ABCD-EFGH', version: '3.2.11.0', occurredAt: new Date().toISOString(), reportId: '12345678-1234-4234-8234-123456789abc' };
  fs.writeFileSync(path.join(dir, 'pending-diagnostics.json'), JSON.stringify(Array.from({ length: 20 }, (_, code) => ({ ...report, code }))));
  const d = createDiagnostics({ userDataDir: dir, version: '3.2.12.0', getConsent: () => ({ usageSharing: true, anonymousId: 'BE-ABCD-EFGH' }), fetchImpl: async () => { throw Error('offline'); } });
  const error = new TypeError('private text'); error.stack = 'TypeError: private\n at x (C:\\Users\\private\\src\\app.js:123:5)';
  assert.equal(d.report('startup-failed', { component: 'main', ...exceptionDetails(error) }), true);
  await d.flush();
  const pending = JSON.parse(fs.readFileSync(path.join(dir, 'pending-diagnostics.json')));
  assert.equal(pending.length, 20); assert.equal(pending[0].event, 'startup-failed'); assert.equal(pending[0].source, 'app.js');
  assert.doesNotMatch(JSON.stringify(pending), /private|Users/);
});
test('local window failures release the auxiliary window and untrusted frames cannot use its bridge', async () => {
  class Window extends EventEmitter {
    constructor(){ super(); this.visible=false; this.dead=false; this.webContents=Object.assign(new EventEmitter(),{mainFrame:{},getURL:()=>require('node:url').pathToFileURL(path.resolve('src/ui/help.html')).href,setWindowOpenHandler(){}}); }
    isDestroyed(){return this.dead;}isVisible(){return this.visible;}isMinimized(){return false;}getChildWindows(){return [];}show(){this.visible=true;}focus(){}destroy(){this.dead=true;this.emit('closed');this.webContents.emit('destroyed');}loadFile(){return Promise.reject(Error('missing'));}
  }
  const win = new Window(), file=path.resolve('src/ui/help.html'); rememberLocalWindow(win,file);
  assert.equal(trustedLocal({sender:win.webContents,senderFrame:{}},win),false);
  assert.equal(trustedLocal({sender:win.webContents,senderFrame:win.webContents.mainFrame},win),true);
  const reports = [];
  win.loadFile = () => Promise.reject(Object.assign(Error('private path'), { code: 'ERR_FILE_NOT_FOUND' }));
  loadLocalWindow(win,file,{ diagnostic: (event, details) => reports.push({ event, ...details }) });
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(win.dead,true);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].code, 'ERR_FILE_NOT_FOUND');
  assert.equal(reports[0].reason, 'exception');
  assert.doesNotMatch(JSON.stringify(reports), /private path/);
});
