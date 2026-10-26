'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPageRecovery } = require('../../src/page-recovery');
const timerContexts = new WeakSet();

function fixture(t) {
  if (!timerContexts.has(t)) { t.mock.timers.enable({ apis: ['setTimeout'] }); timerContexts.add(t); }
  const wc = new EventEmitter(), loads = [], states = [];
  let url = '';
  wc.isDestroyed = () => false;
  wc.getURL = () => url;
  wc.loadURL = next => {
    url = next; loads.push(next);
    wc.emit('did-start-navigation', {}, next, false, true);
    return Promise.resolve();
  };
  const recovery = createPageRecovery(wc, { onState: state => states.push(state) });
  const fail = (code = -106, main = true) => wc.emit('did-fail-load', {}, code, 'private technical error', 'https://example.org/puzzle', main);
  return { wc, loads, states, recovery, fail };
}

test('offline page retries twice with backoff, then offers refresh without technical errors', t => {
  const f = fixture(t);
  f.recovery.load('https://example.org/puzzle');
  f.fail();
  assert.equal(f.states.at(-1), 'loading');
  assert.match(decodeURIComponent(f.loads.at(-1)), /Reconnecting/);
  f.wc.emit('did-finish-load'); // internal recovery document must not mark ready
  assert.equal(f.states.at(-1), 'loading');
  t.mock.timers.tick(2000);
  f.fail(-105);
  t.mock.timers.tick(5999);
  assert.equal(f.loads.filter(url => url.startsWith('https:')).length, 2);
  t.mock.timers.tick(1);
  f.fail(-109);
  assert.equal(f.states.at(-1), 'failed');
  assert.match(decodeURIComponent(f.loads.at(-1)), /Refresh or Retry/);
  assert.doesNotMatch(decodeURIComponent(f.loads.at(-1)), /private|ERR_|-109/);
  t.mock.timers.tick(60000);
  assert.equal(f.loads.filter(url => url.startsWith('https:')).length, 3);
});

test('successful retry clears the retry budget and marks the page ready', t => {
  const f = fixture(t);
  f.recovery.load('https://example.org/puzzle'); f.fail();
  t.mock.timers.tick(2000); f.wc.emit('did-finish-load');
  assert.equal(f.states.at(-1), 'ready');
  t.mock.timers.tick(60000);
  assert.equal(f.loads.filter(url => url.startsWith('https:')).length, 2);
});

test('new navigation, hiding the pane, destruction and close cancel pending retries', t => {
  for (const finish of [
    f => f.recovery.load('https://example.org/another'),
    f => f.wc.loadURL('about:blank'),
    f => f.wc.emit('destroyed'),
    f => f.recovery.dispose()
  ]) {
    const f = fixture(t);
    f.recovery.load('https://example.org/puzzle'); f.fail(); finish(f);
    const count = f.loads.length;
    t.mock.timers.tick(60000);
    assert.equal(f.loads.length, count);
  }
});

test('certificate errors, page initiated navigations, redirects, crashes and freezes are never automatically replayed', t => {
  for (const kind of ['certificate', 'form', 'redirect', 'crash', 'freeze', 'slow']) {
    const f = fixture(t);
    if (kind === 'form') f.wc.loadURL('https://example.org/puzzle');
    else f.recovery.load('https://example.org/puzzle');
    if (kind === 'redirect') f.wc.emit('did-redirect-navigation', {}, 'https://example.org/puzzle', false, true);
    if (kind === 'crash') f.wc.emit('render-process-gone');
    else if (kind === 'freeze') f.wc.emit('unresponsive');
    else if (kind !== 'slow') f.fail(kind === 'certificate' ? -202 : -106);
    const count = f.loads.length;
    t.mock.timers.tick(60000);
    assert.equal(f.loads.length, count, kind);
  }
});

test('cancelled requests, subframes and late failures do not replace the current page', t => {
  const f = fixture(t);
  f.recovery.load('https://example.org/puzzle');
  f.fail(-3); f.fail(-106, false);
  f.recovery.load('https://example.org/new'); f.fail();
  assert.equal(f.loads.length, 2);
  t.mock.timers.tick(60000);
  assert.equal(f.loads.length, 2);
});
