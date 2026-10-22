'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createStartupLog, handleLaunches, guardStartupWindow } = require('../../src/startup');

function window() {
  const win = new EventEmitter();
  Object.assign(win, {
    webContents: new EventEmitter(), visible: false, minimized: false, destroyed: false,
    shows: 0, restores: 0, focuses: 0, children: [],
    isDestroyed() { return this.destroyed; }, isVisible() { return this.visible; },
    isMinimized() { return this.minimized; }, getChildWindows() { return this.children; },
    restore() { this.minimized = false; this.restores++; },
    show() { this.visible = true; this.shows++; }, focus() { this.focuses++; }
  });
  return win;
}

test('rapid clicks before readiness coalesce; hidden and minimized windows can be reopened', () => {
  const app = new EventEmitter(), win = window();
  const launches = handleLaunches(app);
  for (let i = 0; i < 12; i++) app.emit('second-instance');
  launches.attach(win);
  assert.equal(win.shows, 1);
  assert.equal(win.focuses, 1, 'early clicks become one activation');
  win.visible = false; win.minimized = true;
  app.emit('second-instance');
  assert.equal(win.shows, 2);
  assert.equal(win.restores, 1);
  for (let i = 0; i < 12; i++) app.emit('second-instance');
  assert.equal(win.shows, 2, 'visible window is not shown or loaded again');
  const child = window(); child.visible = true; child.isModal = () => true;
  win.children.push(child);
  app.emit('second-instance');
  assert.equal(child.focuses, 1, 'keep the active modal dialog usable');
  app.emit('before-quit');
  const focuses = win.focuses;
  app.emit('second-instance'); app.emit('activate');
  assert.equal(win.focuses, focuses, 'clicks during shutdown do not reopen the window');
});

test('destroyed windows and early shutdown safely ignore queued activations', () => {
  const app = new EventEmitter(), win = window();
  const launches = handleLaunches(app);
  app.emit('second-instance'); app.emit('before-quit'); launches.attach(win);
  assert.equal(win.shows, 0);
  const next = new EventEmitter(); handleLaunches(next).attach(win);
  win.destroyed = true;
  assert.doesNotThrow(() => next.emit('second-instance'));
  assert.equal(win.shows, 0);
});

test('window is immediately visible without ready-to-show; stalled startup reports one failure', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const win = window(), failures = [];
  const guard = guardStartupWindow(win, { onFailure: e => failures.push(e.message) });
  assert.equal(win.visible, true);
  t.mock.timers.tick(60000);
  assert.match(failures[0], /did not finish loading/);
  guard.fail('another error');
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  assert.equal(failures.length, 1);
});

test('successful local shell load clears watchdog; later renderer crash is reported', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const win = window(), failures = [];
  guardStartupWindow(win, { onFailure: e => failures.push(e.message) });
  win.webContents.emit('did-finish-load');
  t.mock.timers.tick(120000);
  assert.equal(failures.length, 0);
  win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 9 });
  assert.match(failures[0], /crashed, code 9/);
});

test('ignore cancelled navigation and subframes; real local load failure is handled once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const win = window(), failures = [];
  const guard = guardStartupWindow(win, { onFailure: e => failures.push(e.message) });
  win.webContents.emit('did-fail-load', {}, -3, 'cancelled', 'file:', true);
  win.webContents.emit('did-fail-load', {}, -6, 'missing frame', 'file:', false);
  assert.equal(failures.length, 0);
  win.webContents.emit('did-fail-load', {}, -6, 'missing', 'file:', true);
  guard.fail('rejected load promise');
  assert.deepEqual(failures, ['The main window could not load (code -6).']);
});

test('closing during startup cancels watchdog and ignores late failures', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const win = window(), failures = [];
  const guard = guardStartupWindow(win, { onFailure: e => failures.push(e.message) });
  win.emit('closed'); win.destroyed = true;
  t.mock.timers.tick(120000);
  guard.fail('late load rejection');
  assert.equal(failures.length, 0);
});

test('diagnostics rotate, sanitize multiline entries and tolerate unwritable storage', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-startup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = createStartupLog(dir);
  fs.writeFileSync(log.file, 'x'.repeat(128 * 1024 + 1));
  log.write('launch', 'one\ntwo\rthree');
  assert.ok(fs.existsSync(log.file + '.previous'));
  assert.match(fs.readFileSync(log.file, 'utf8'), /launch one two three\n$/);
  assert.doesNotThrow(() => createStartupLog(log.file).write('launch'));
});

function boot({ lock = true, createError } = {}) {
  const app = new EventEmitter(), calls = { create: 0, errors: [], exits: [] };
  let ready;
  Object.assign(app, {
    requestSingleInstanceLock: () => lock, quit: () => { calls.quit = true; },
    getPath: () => 'test-user-data', whenReady: () => new Promise(resolve => { ready = resolve; }),
    exit: code => calls.exits.push(code)
  });
  const win = window();
  const modules = {
    electron: { app, Menu: { setApplicationMenu() {} }, dialog: { showErrorBox: (...args) => calls.errors.push(args) }, shell: {} },
    './startup': { ...require('../../src/startup'), createStartupLog: () => ({ file: 'startup.log', write() {} }) },
    './version': { displayVersion: () => 'test' }, '../package.json': {},
    './diagnostics': { exceptionDetails: () => ({}), createDiagnostics: () => ({ report() {}, flush: async () => {}, flushWithin: async () => {} }) },
    './app': { createApp: () => { calls.create++; if (createError) throw createError; return { win, setUpdateActions() {} }; } },
    './updates': { startUpdates: () => ({}) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main.js'), 'utf8'), {
    require: name => { assert.ok(name in modules, name); return modules[name]; },
    process: { platform: 'win32', argv: [] }
  });
  return { app, win, calls, ready: () => ready() };
}

test('actual entry point creates one app despite repeated clicks before and after ready', async () => {
  const b = boot();
  for (let i = 0; i < 8; i++) b.app.emit('second-instance');
  b.ready(); await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 8; i++) b.app.emit('second-instance');
  assert.equal(b.calls.create, 1);
  assert.equal(b.win.shows, 1);
  assert.equal(b.calls.errors.length, 0);
});

test('a duplicate process exits without initializing the application', () => {
  const b = boot({ lock: false });
  assert.equal(b.calls.quit, true);
  assert.equal(b.calls.create, 0);
});

test('startup exception displays diagnostics and exits to release instance lock', async () => {
  const b = boot({ createError: new Error('startup failed') });
  b.ready(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.calls.errors.length, 1);
  assert.match(b.calls.errors[0][1], /startup.log/);
  assert.deepEqual(b.calls.exits, [1]);
});
