'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { supportSummary } = require('../../src/support');

test('support uses the installation ID without guessing a server-reserved first name', () => {
  const summary = supportSummary({ version: '3.3.0', anonymousId: 'BE-9D3P-CWUT', paneHealth: {}, update: { phase: 'idle' } });
  assert.match(summary, /Installation: BE-9D3P-CWUT/);
  assert.doesNotMatch(summary, /Joshua| · /);
});
