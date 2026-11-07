'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelemetry } = require('../../src/telemetry');

test('celebration reports carry only named animations, including reduced motion', async () => {
  let sent;
  const telemetry = createTelemetry({ endpoint: 'https://example.test', enabled: () => true,
    fetchImpl: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true }; } });
  for (const animation of ['curtain', 'lanterns', 'message']) {
    await telemetry.send('option', { item: 'Fireworks replay', animation }); assert.equal(sent.animation, animation);
  }
  await telemetry.send('option', { item: 'Fireworks', animation: '@everyone' }); assert.equal(sent.animation, undefined);
  await telemetry.send('option', { item: 'Zoom 100%', animation: 'curtain' }); assert.equal(sent.animation, undefined);
});

test('notification acknowledgement permits server work but remains bounded', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const telemetry = createTelemetry({ endpoint: 'https://example.test', enabled: () => true,
    version: '3.5.0.1', anonymousId: 'BE-ABCD-EFGH', fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }) });
  const pending = telemetry.send('upgrade', { previousVersion: '3.5.0.0' });
  t.mock.timers.tick(11999); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); assert.equal(await pending, false);
});

test('telemetry sends only an approved event after opt-in', async () => {
  let enabled = false, sent;
  const telemetry = createTelemetry({
    endpoint: 'https://example.test/api/babble-notify', enabled: () => enabled,
    version: '3.1.2.0', anonymousId: 'BE-ABCD-EFGH', platform: 'win32', architecture: 'x64',
    fetchImpl: async (url, options) => { sent = { url, ...options, body: JSON.parse(options.body) }; return { ok: true }; }
  });
  assert.equal(await telemetry.send('resource', 'Lickety Info'), false);
  assert.equal(sent, undefined);
  enabled = true;
  assert.equal(await telemetry.send('resource', 'Lickety Info'), true);
  assert.equal(sent.url, 'https://example.test/api/babble-notify');
  assert.deepEqual(sent.body, { event: 'resource', version: '3.1.2.0', platform: 'win32', architecture: 'x64', anonymousId: 'BE-ABCD-EFGH', item: 'Lickety Info' });
  assert.equal(await telemetry.send('word', 'secret'), false);
  assert.equal(sent.body.item, 'Lickety Info');
  assert.equal(await telemetry.send('session', { durationSeconds: 125.4 }), true);
  assert.equal(sent.body.durationSeconds, 125);
});

test('city enrichment requires the updated consent and cannot be enabled through event details', async () => {
  let city = false, sent;
  const telemetry = createTelemetry({
    endpoint: 'https://example.test', enabled: () => true, cityEnabled: () => city,
    version: '3.2.4.0', anonymousId: 'BE-ABCD-EFGH',
    fetchImpl: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true }; }
  });
  await telemetry.send('option', { locationConsentVersion: 3 });
  assert.equal(sent.locationConsentVersion, undefined);
  city = true;
  await telemetry.send('session');
  assert.equal(sent.locationConsentVersion, 3);
});

test('startup reports require opt-in and are attempted once per app even during concurrent calls', async () => {
  let enabled = false, calls = 0;
  const options = { endpoint: 'https://example.test/api/babble-notify', enabled: () => enabled, version: '3.2.12.0', anonymousId: 'BE-ABCD-EFGH', fetchImpl: async () => { calls++; return { ok: true }; } };
  const telemetry = createTelemetry(options);
  assert.equal(await telemetry.send('startup'), false); assert.equal(calls, 0);
  enabled = true;
  await Promise.all([telemetry.send('startup'), telemetry.send('startup')]);
  assert.equal(calls, 1);
  enabled = false; await telemetry.send('startup'); enabled = true; await telemetry.send('startup');
  assert.equal(calls, 1);
  await createTelemetry(options).send('startup'); assert.equal(calls, 2);
});
