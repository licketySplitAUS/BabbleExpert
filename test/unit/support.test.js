'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { supportSummary } = require('../../src/support');

test('support uses the installation ID without guessing a server-reserved first name', () => {
  const summary = supportSummary({ version: '3.3.0', anonymousId: 'BE-9D3P-CWUT', paneHealth: {}, update: { phase: 'idle' } });
  assert.match(summary, /Installation: BE-9D3P-CWUT/);
  assert.doesNotMatch(summary, /Joshua| · /);
  const timed = supportSummary({ version: '3.6.0', paneHealth: {}, update: { phase: 'idle' }, diagnostics: [
    { event: 'load-recovered', component: 'main', elapsedMs: 42300 },
    { event: 'load-slow', component: 'clues', elapsedMs: 'private text' },
  ] });
  assert.match(timed, /elapsed=42.3s/);
  assert.doesNotMatch(timed, /private text/);
  const startup = supportSummary({ version: '3.6.0', paneHealth: {}, update: { phase: 'idle' }, startupTimings: {
    localStateMs: 24, mainPageMs: 180.6, babbleReadyMs: 3200, cluesReadyMs: 'private text', privatePath: 'C:/private',
  } });
  assert.match(startup, /Local state ready: 24 ms/);
  assert.match(startup, /Main page loaded: 181 ms/);
  assert.match(startup, /Babble ready: 3200 ms/);
  assert.doesNotMatch(startup, /private|Clues ready:/);
});
