'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { createDiagnostics, readDiagnosticConsent, watchPageDiagnostics, updateErrorCode, safeDetails } = require('../../src/diagnostics');

test('update error details survive the reporting allowlist without native text or URLs', () => {
  const cases = [
    [{ code: 'HTTP_ERROR_403', message: 'secret response' }, 'ERR_HTTP_403'],
    [{ statusCode: 429 }, 'ERR_HTTP_429'],
    [{ cause: { code: 'ENOTFOUND' } }, 'ENOTFOUND'],
    [{ message: 'net::ERR_NAME_NOT_RESOLVED https://secret.example/path' }, 'ERR_NAME_NOT_RESOLVED'],
    [{ code: 'ERR_UPDATER_INVALID_RELEASE_FEED', message: 'secret XML' }, 'ERR_UPDATER_INVALID_RELEASE_FEED'],
    [{ name: 'AbortError' }, 'ERR_UPDATE_ABORTED'],
    [{ code: 'private/path', message: 'private/path' }, 'ERR_UPDATE_UNKNOWN'],
    [null, 'ERR_UPDATE_UNKNOWN']
  ];
  for (const [error, expected] of cases) {
    const details = safeDetails('update-failed', { component: 'updater', code: updateErrorCode(error) });
    assert.equal(details.code, expected);
    assert.doesNotMatch(JSON.stringify(details), /secret|private|https:|XML/);
  }
});

test('freeze recovery measures from the first unresponsive event and ignores unmatched recovery', () => {
  const wc = new EventEmitter(), reports = [];
  let clock = 100;
  watchPageDiagnostics(wc, 'clues', (event, data) => reports.push({ event, ...data }), { now: () => clock });
  wc.emit('responsive');
  wc.emit('unresponsive');
  clock += 5000; wc.emit('unresponsive');
  clock += 4706; wc.emit('responsive');
  wc.emit('responsive');
  assert.deepEqual(reports, [
    { event: 'unresponsive', component: 'clues' },
    { event: 'responsive', component: 'clues', elapsedMs: 9706 }
  ]);
});
function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-diagnostic-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = { data: { usageSharing: true, anonymousId: 'BE-ABCD-EFGH' } };
  const sent = [];
  const config = { userDataDir: dir, version: '3.2.11.0', getConsent: () => settings.data,
    fetchImpl: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; }, ...options };
  return { dir, settings, sent, config, diagnostics: createDiagnostics(config) };
}
test('only opted-in diagnostics send; unknown consent and opting out remove pending data', async t => {
  const f = fixture(t);
  f.settings.data.usageSharing = null;
  assert.equal(f.diagnostics.report('startup-failed', { component: 'main' }), false);
  f.settings.data.usageSharing = false;
  assert.equal(f.diagnostics.report('load-failed', { component: 'clues', code: -105 }), false);
  await f.diagnostics.flush();
  assert.equal(f.sent.length, 0);
  assert.deepEqual(readDiagnosticConsent(f.dir), {});
  fs.writeFileSync(path.join(f.dir, 'pending-diagnostics.json'), '[]');
  f.diagnostics.preferenceChanged();
  assert.equal(fs.existsSync(path.join(f.dir, 'pending-diagnostics.json')), false);
});
test('reports strip sensitive details and deduplicate repeated errors without blocking activation', async t => {
  const f = fixture(t);
  const details = { component: 'clues', code: -105, message: 'private', stack: 'C:\\Users\\private', url: 'https://private.example/' };
  assert.equal(f.diagnostics.report('load-failed', details), true);
  assert.equal(f.diagnostics.report('load-failed', details), false);
  await f.diagnostics.flush();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].code, -105);
  assert.equal(f.sent[0].anonymousId, 'BE-ABCD-EFGH');
  assert.doesNotMatch(JSON.stringify(f.sent), /private|Users|stack|url/);
  assert.equal(fs.existsSync(path.join(f.dir, 'pending-diagnostics.json')), false);
});
test('offline reports survive relaunch and retain the original report ID and app version', async t => {
  const f = fixture(t, { fetchImpl: async () => { throw Error('offline'); } });
  f.diagnostics.report('update-failed', { component: 'updater', reason: 'download', code: 'ERR_UPDATER_INVALID_SIGNATURE', targetVersion: '3.2.12' });
  await f.diagnostics.flush();
  const pending = JSON.parse(fs.readFileSync(path.join(f.dir, 'pending-diagnostics.json'), 'utf8'));
  const sent = [];
  const next = createDiagnostics({ ...f.config, version: '3.2.12.0', fetchImpl: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; } });
  await next.flush();
  assert.equal(sent[0].reportId, pending[0].reportId);
  assert.equal(sent[0].version, '3.2.11.0');
  assert.equal(sent[0].targetVersion, '3.2.12');
  assert.equal(fs.existsSync(path.join(f.dir, 'pending-diagnostics.json')), false);
});
test('retry cooldown and queue cap avoid floods; disabling sharing purges the queue', async t => {
  let requests = 0;
  const f = fixture(t, { fetchImpl: async () => { requests++; return { ok: false, status: 502 }; } });
  f.diagnostics.report('load-failed', { component: 'babble', code: -105 });
  await f.diagnostics.flush();
  for (let code = 1; code < 100; code++) f.diagnostics.report('load-failed', { component: 'clues', code });
  await f.diagnostics.flush();
  assert.equal(requests, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'pending-diagnostics.json'), 'utf8')).length, 20);
  f.settings.data.usageSharing = false;
  f.diagnostics.preferenceChanged();
  assert.equal(fs.existsSync(path.join(f.dir, 'pending-diagnostics.json')), false);
});
test('expired reports are discarded and corrupt storage does not prevent startup', async t => {
  const f = fixture(t, { fetchImpl: async () => { throw Error('offline'); }, now: () => Date.UTC(2026, 9, 1) });
  f.diagnostics.report('startup-failed', { component: 'main', reason: 'exception' });
  await f.diagnostics.flush();
  const next = createDiagnostics({ ...f.config, now: () => Date.UTC(2026, 9, 22), fetchImpl: async () => assert.fail('expired report') });
  await next.flush();
  fs.writeFileSync(path.join(f.dir, 'pending-diagnostics.json'), 'corrupt');
  assert.doesNotThrow(() => createDiagnostics(f.config));
});
test('fatal shutdown flush has a strict deadline even if transport stalls', async t => {
  const f = fixture(t, { fetchImpl: () => new Promise(() => {}) });
  f.diagnostics.report('startup-failed', { component: 'main' });
  await f.diagnostics.flushWithin(5);
  assert.equal(fs.existsSync(path.join(f.dir, 'pending-diagnostics.json')), true);
});
test('reports expiring during delivery empty the queue without rejecting flush', async t => {
  let clock = Date.UTC(2026, 9, 27), finish;
  const f = fixture(t, { now: () => clock, fetchImpl: () => new Promise(resolve => { finish = resolve; }) });
  f.diagnostics.report('load-failed', { component: 'clues', code: -105 });
  f.diagnostics.report('load-failed', { component: 'babble', code: -105 });
  const flushing = f.diagnostics.flush();
  clock += 8 * 86400000;
  finish({ ok: true });
  assert.equal(await flushing, true);
  assert.equal(fs.existsSync(path.join(f.dir, 'pending-diagnostics.json')), false);
});
test('page observer reports slow/recovered, load errors and crashes while ignoring cancelled/subframe navigation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const wc = new EventEmitter(), sent = [];
  let clock = 100;
  watchPageDiagnostics(wc, 'clues', (event, details) => sent.push({ event, ...details }), { now: () => clock });
  wc.emit('did-start-navigation', {}, 'https://secret.example/path', false, false);
  t.mock.timers.tick(30000); assert.equal(sent.length, 0);
  wc.emit('did-start-navigation', {}, 'https://secret.example/path', false, true);
  clock += 30000; t.mock.timers.tick(30000);
  wc.emit('did-finish-load');
  assert.deepEqual(sent.map(r => r.event), ['load-slow', 'load-recovered']);
  wc.emit('did-fail-load', {}, -3, 'cancel', 'private', true);
  wc.emit('did-fail-load', {}, -105, 'name private', 'private', false);
  assert.equal(sent.length, 2);
  wc.emit('did-fail-load', {}, -105, 'name private', 'private', true);
  wc.emit('unresponsive'); wc.emit('responsive'); wc.emit('responsive');
  wc.emit('render-process-gone', {}, { reason: 'oom', exitCode: -1 });
  assert.deepEqual(sent.map(r => r.event), ['load-slow', 'load-recovered', 'load-failed', 'unresponsive', 'responsive', 'renderer-crashed']);
  assert.doesNotMatch(JSON.stringify(sent), /secret|private/);
  wc.emit('did-start-navigation', {}, 'https://secret.example', false, true);
  wc.emit('destroyed'); t.mock.timers.tick(30000);
  assert.equal(sent.length, 6);
});
