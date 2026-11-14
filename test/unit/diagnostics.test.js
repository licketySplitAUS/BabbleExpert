'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { createDiagnostics, readDiagnosticConsent, watchPageDiagnostics, updateErrorCode, safeDetails } = require('../../src/diagnostics');

test('update error details survive the reporting allowlist without native text or URLs', () => {
  assert.equal(safeDetails('load-failed', { component: 'auxiliary', window: 'highlights' }).window, 'highlights');
  assert.equal(safeDetails('load-failed', { component: 'auxiliary', window: 'private path' }).window, undefined);
  const cases = [
    [{ code: 'HTTP_ERROR_403', message: 'secret response' }, 'ERR_HTTP_403'],
    [{ statusCode: 429 }, 'ERR_HTTP_429'],
    [{ cause: { code: 'ENOTFOUND' } }, 'ENOTFOUND'],
    [{ message: 'net::ERR_NAME_NOT_RESOLVED https://secret.example/path' }, 'ERR_NAME_NOT_RESOLVED'],
    [{ code: 'ERR_UPDATER_INVALID_RELEASE_FEED', message: 'secret XML' }, 'ERR_UPDATER_INVALID_RELEASE_FEED'],
    [{ code: 'ERR_UPDATER_INVALID_RELEASE_FEED', message: 'Cannot parse releases feed: Error: Unable to find latest version: HttpError: 504 Gateway Timeout\nXML:\nsecret XML' }, 'ERR_HTTP_504'],
    [{ code: 'ERR_UPDATER_INVALID_RELEASE_FEED', message: 'Cannot parse releases feed: net::ERR_NAME_NOT_RESOLVED\nXML:\nsecret XML' }, 'ERR_NAME_NOT_RESOLVED'],
    [{ code: 'ERR_UPDATER_INVALID_RELEASE_FEED', message: 'Cannot parse releases feed: invalid\nXML:\nHttpError: 504' }, 'ERR_UPDATER_INVALID_RELEASE_FEED'],
    [{ name: 'AbortError' }, 'ERR_UPDATE_ABORTED'],
    [{ message: 'Request timed out' }, 'ETIMEDOUT'],
    [{ message: 'Request has been aborted by the server' }, 'ERR_CONNECTION_CLOSED'],
    [{ message: 'net::ERR_SOCKET_NOT_CONNECTED https://secret.example' }, 'ERR_SOCKET_NOT_CONNECTED'],
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
  assert.match(reports[0].incidentId, /^[a-f0-9-]{36}$/);
  assert.equal(reports[0].incidentId, reports[1].incidentId);
  assert.ok(reports.every(item => item.timingStatus === 'continuous'));
  assert.deepEqual(reports.map(({ incidentId, timingStatus, ...data }) => data), [
    { event: 'unresponsive', component: 'clues' },
    { event: 'responsive', component: 'clues', elapsedMs: 9706 }
  ]);
});
test('sleep interrupts paired load/freeze timings, excludes elapsed, and releases power listeners', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const wc = new EventEmitter(), powerMonitor = new EventEmitter(), reports = []; let now = 100;
  watchPageDiagnostics(wc, 'babble', (event, data) => reports.push({ event, ...data }), { now: () => now, powerMonitor, slowMs: 1000 });
  wc.emit('did-start-navigation', {}, 'https://playbabble.com', false, true);
  now += 1000; t.mock.timers.tick(1000); wc.emit('unresponsive');
  powerMonitor.emit('suspend'); now += 20 * 60 * 60 * 1000; powerMonitor.emit('resume');
  wc.emit('did-finish-load'); wc.emit('responsive');
  assert.equal(reports[0].incidentId, reports[2].incidentId);
  assert.equal(reports[1].incidentId, reports[3].incidentId);
  assert.ok(reports.slice(2).every(data => data.timingStatus === 'interrupted' && data.elapsedMs === undefined));
  assert.equal(safeDetails('responsive', { component: 'babble', timingStatus: 'interrupted', elapsedMs: now }).elapsedMs, undefined);
  wc.emit('destroyed'); assert.equal(powerMonitor.listenerCount('suspend'), 0); assert.equal(powerMonitor.listenerCount('resume'), 0);
});
test('a severely delayed slow timer marks its measurement interrupted rather than reporting hours of continuous loading', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const wc = new EventEmitter(), reports = []; let now = 0;
  watchPageDiagnostics(wc, 'main', (event, data) => reports.push({ event, ...data }), { now: () => now, slowMs: 1000 });
  wc.emit('did-start-navigation', {}, 'file:///app.html', false, true);
  now = 3600000; t.mock.timers.tick(1000); wc.emit('did-finish-load');
  assert.ok(reports.every(data => data.timingStatus === 'interrupted' && data.elapsedMs === undefined)); wc.emit('destroyed');
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
  const f = fixture(t, { now: () => Date.UTC(2026, 10, 8), fetchImpl: async () => { requests++; return { ok: false, status: 502 }; } });
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


test('upgrade stages and interrupted incident IDs survive the offline queue without gaining private fields', async t => {
  const f = fixture(t, { fetchImpl: async () => { throw Error('offline'); } });
  f.diagnostics.report('update-stage', { component: 'updater', stage: 'install-requested', targetVersion: '4.1.0', previousVersion: '4.0.0.0', words: ['private'] });
  f.diagnostics.report('responsive', { component: 'babble', incidentId: '12345678-1234-4234-8234-123456789abc', timingStatus: 'interrupted', elapsedMs: 73032100 });
  await f.diagnostics.flush();
  const sent = [];
  const next = createDiagnostics({ ...f.config, fetchImpl: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; } });
  await next.flush();
  assert.equal(sent.length, 2); assert.equal(sent[0].stage, 'install-requested'); assert.equal(sent[0].previousVersion, '4.0.0.0');
  assert.equal(sent[1].timingStatus, 'interrupted'); assert.equal(sent[1].elapsedMs, undefined); assert.equal(sent[1].incidentId, '12345678-1234-4234-8234-123456789abc');
  assert.doesNotMatch(JSON.stringify(sent), /private|words/);
  f.settings.data.usageSharing = false;
  assert.equal(next.report('update-stage', { component:'updater',stage:'later',targetVersion:'4.1.0' }),false);
});


test('confirmed offline requests are ignored, while DNS/permission errors are not assumed to mean offline', async t => {
  const { updateNetworkDetails } = require('../../src/diagnostics');
  const f=fixture(t,{isOnline:()=>false});
  assert.equal(f.diagnostics.report('load-failed',{component:'babble',code:-106}),false);
  assert.equal(f.diagnostics.report('update-failed',{component:'updater',code:'ERR_NAME_NOT_RESOLVED'}),false);
  assert.equal(f.diagnostics.report('celebration-pack-failed',{component:'resources',code:'ERR_CELEBRATION_DOWNLOAD_FAILED'}),false);
  assert.equal(f.diagnostics.report('update-failed',{component:'updater',code:'EPERM',networkState:'offline'}),true);
  await f.diagnostics.flush(); assert.equal(f.sent.length,1);assert.equal(f.sent[0].code,'EPERM');
  const g=fixture(t,{isOnline:()=>true});
  const details={component:'updater',code:'ERR_NAME_NOT_RESOLVED',...updateNetworkDetails({message:'https://api.github.com/private?secret=example net::ERR_NAME_NOT_RESOLVED'},()=>true)};
  assert.equal(g.diagnostics.report('update-failed',details),true);await g.diagnostics.flush();
  assert.equal(g.sent[0].service,'github-api');assert.equal(g.sent[0].networkState,'online-hint');
  assert.doesNotMatch(JSON.stringify(g.sent),/secret|private|https:/);
});

test('resource samples aggregate Expert processes, use CPU deltas, and reset across sleep, long gaps and opt-out', t => {
  t.mock.timers.enable({apis:['setInterval']});
  const {createResourceSampler}=require('../../src/resource-sampler');const powerMonitor=new EventEmitter();let now=0,enabled=true,calls=0,cpu=10;
  const sampler=createResourceSampler({now:()=>now,enabled:()=>enabled,powerMonitor,freeMemory:()=>400*1048576,logicalCPUs:()=>2,getMetrics:()=>{calls++;return [
    {pid:1,creationTime:1,memory:{workingSetSize:1024,privateBytes:512},cpu:{cumulativeCPUUsage:cpu}},
    {pid:2,creationTime:1,memory:{workingSetSize:2048,privateBytes:1024},cpu:{cumulativeCPUUsage:cpu+10}}
  ];}});t.after(sampler.stop);
  let data=sampler.snapshot();assert.equal(data.appWorkingSetMB,3);assert.equal(data.freeMemoryMB,400);assert.equal(data.appCpuPercent,undefined);
  now=30000;cpu+=6;sampler.tick();data=sampler.snapshot();assert.equal(data.appCpuPercent,20);assert.equal(data.sampleWindowSeconds,30);
  assert.doesNotMatch(JSON.stringify(data),/pid|creationTime/);
  powerMonitor.emit('suspend');assert.deepEqual(sampler.snapshot(),{});now+=3600000;powerMonitor.emit('resume');assert.equal(sampler.snapshot().appCpuPercent,undefined);
  now+=180000;sampler.tick();assert.equal(sampler.snapshot().appCpuPercent,undefined);
  enabled=false;const before=calls;sampler.tick();assert.deepEqual(sampler.snapshot(),{});assert.equal(calls,before);
});
