'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { Settings, DEFAULTS } = require('../../src/settings');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'be-')), 'settings.json');

test('defaults when no file; saved values survive a restart', () => {
  const f = tmp(); const s = new Settings(f);
  assert.deepEqual(s.data.add.speed, DEFAULTS.add.speed);
  s.patch({ yellow: true, switchSides: true, clueSource: 'selfServe', cluesW: 333, add: { thin: true, speed: 0, fontSize: '24pt', noChat: true } }); s.flush();
  const s2 = new Settings(f);
  assert.equal(s2.data.yellow, true); assert.equal(s2.data.switchSides, true); assert.equal(s2.data.cluesW, 333);
  assert.equal(s2.data.clueSource, 'selfServe');
  assert.deepEqual([s2.data.add.thin, s2.data.add.speed, s2.data.add.fontSize, s2.data.add.noChat], [true, 0, '24pt', true]);
});

test('invalid or unknown values are ignored', () => {
  const s = new Settings(tmp());
  s.patch({ yellow: 'yes', clueSource: 'unknown', cluesW: -5, resW: 1e9, bogus: 1, add: { speed: 99, fontSize: '1pt', thin: 'x', __proto__: { polluted: 1 } } });
  assert.equal(s.data.yellow, false); assert.equal(s.data.cluesW, DEFAULTS.cluesW); assert.equal(s.data.resW, DEFAULTS.resW);
  assert.equal(s.data.clueSource, 'lickety');
  assert.equal(s.data.add.speed, 3); assert.equal(s.data.add.fontSize, '20pt'); assert.equal(s.data.add.thin, false);
  assert.equal(s.data.bogus, undefined); assert.equal({}.polluted, undefined);
});

test('a corrupt settings file falls back to defaults instead of crashing', () => {
  const f = tmp(); fs.writeFileSync(f, '{ not json');
  assert.equal(new Settings(f).data.cluesW, DEFAULTS.cluesW);
});
