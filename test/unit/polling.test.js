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
