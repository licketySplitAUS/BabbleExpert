'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelemetry } = require('../../src/telemetry');

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
