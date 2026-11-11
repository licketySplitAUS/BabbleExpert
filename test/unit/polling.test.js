'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { singleFlight } = require('../../src/polling');
test('slow scans coalesce rather than accumulating queued page work', async () => {
  let finish, calls = 0;
  const scan = singleFlight(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = scan();
  await Promise.resolve();
  for (let i = 0; i < 100; i++) assert.equal(scan(), first);
  assert.equal(calls, 1);
  finish(); await first;
  const next = scan(); await Promise.resolve();
  assert.equal(calls, 2);
  finish(); await next;
});
test('a failed scan releases the next polling cycle', async () => {
  let calls = 0;
  const scan = singleFlight(async () => { if (++calls === 1) throw Error('offline'); return 'ready'; });
  await assert.rejects(scan(), /offline/);
  assert.equal(await scan(), 'ready');
});

test('paused background scans do no page work and resume without a queued backlog', async () => {
  let enabled = false, calls = 0, finish;
  const scan = singleFlight(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, () => enabled);
  for (let i = 0; i < 20; i++) await scan();
  assert.equal(calls, 0);
  enabled = true;
  const pending = scan(); await Promise.resolve();
  enabled = false;
  assert.equal(scan(), pending, 'a scan already running is allowed to finish');
  finish(); await pending;
  await scan(); assert.equal(calls, 1);
  enabled = true;
  const resumed = scan(); await Promise.resolve();
  assert.equal(calls, 2, 'resume does one fresh scan');
  finish(); await resumed;
});
