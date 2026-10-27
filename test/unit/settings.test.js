'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { Settings, DEFAULTS } = require('../../src/settings');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'be-')), 'settings.json');

test('Helpful hints turn off after the first session, then honour manual re-enabling', () => {
  for (const saved of [{}, { hideHints:false }, { hideHints:true }]) {
    const file=tmp(); fs.writeFileSync(file,JSON.stringify(saved));
    const settings=new Settings(file);
    assert.equal(settings.data.hideHints,saved.hideHints===true,'First session keeps the existing preference');
    settings.finishHintsFirstSession(); settings.flush();
    const next=new Settings(file);
    assert.equal(next.data.hideHints,true);
    assert.equal(next.data.hintsFirstSessionFinished,true);
    next.patch({hideHints:false});
    next.finishHintsFirstSession();next.flush();
    assert.equal(new Settings(file).data.hideHints,false,'Later explicit re-enabling survives further exits');
  }
});

test('pane zoom defaults to normal, persists, and rejects unsupported values', () => {
  const file = tmp(), settings = new Settings(file);
  assert.equal(settings.data.zoom, 100);
  settings.patch({ zoom: 150 }); settings.flush();
  const restored = new Settings(file);
  assert.equal(restored.data.zoom, 150);
  for (const zoom of [0, 500, 112, '125', null]) restored.patch({ zoom });
  assert.equal(restored.data.zoom, 150);
});

test('journal enables once for old settings, then remembers future pauses across restarts', () => {
  for (const saved of [{}, { journalEnabled: false }, { journalEnabled: true }]) {
    const file = tmp(); fs.writeFileSync(file, JSON.stringify(saved));
    const settings = new Settings(file);
    assert.equal(settings.data.journalEnabled, true);
    assert.equal(settings.data.usageSharing, null, 'local recording does not enable usage sharing');
    settings.patch({ yellow: true }); settings.flush();
    assert.equal(new Settings(file).data.journalEnabled, true);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).journalDefaultOnApplied, true);
    settings.patch({ journalEnabled: false }); settings.flush();
    const paused = new Settings(file);
    assert.equal(paused.data.journalEnabled, false);
    paused.patch({ yellow: false }); paused.flush();
    assert.equal(new Settings(file).data.journalEnabled, false, 'ordinary settings changes cannot re-enable a paused journal');
  }
});

test('Resources defaults to the left and remembers either side separately from pane swapping', () => {
  const file = tmp(), settings = new Settings(file);
  assert.equal(settings.data.resourcesLeft, true);
  settings.patch({ resourcesLeft: true, switchSides: true }); settings.flush();
  const restored = new Settings(file);
  assert.equal(restored.data.resourcesLeft, true); assert.equal(restored.data.switchSides, true);
  for (const value of ['left', 1, null]) restored.patch({ resourcesLeft: value });
  assert.equal(restored.data.resourcesLeft, true);
  restored.patch({ resourcesLeft: false }); restored.flush();
  const right = new Settings(file);
  assert.equal(right.data.resourcesLeft, false); assert.equal(right.data.switchSides, true);
});

test('defaults when no file; saved values survive a restart', () => {
  const f = tmp(); const s = new Settings(f);
  assert.deepEqual(s.data.add.speed, DEFAULTS.add.speed);
  assert.equal(s.data.highlightEntry, true);
  assert.equal(s.data.createClues, true);
  assert.equal(s.data.usageSharing, null);
  s.patch({ yellow: true, switchSides: true, highlightEntry: false, createClues: true, clueSource: 'selfServe', cluesW: 333, usageSharing: true, usageConsentVersion: 2, telemetryVersion: '3.1.2.0', anonymousId: 'BE-ABCD-EFGH', add: { thin: true, speed: 0, fontSize: '24pt', noChat: true } }); s.flush();
  const s2 = new Settings(f);
  assert.equal(s2.data.yellow, true); assert.equal(s2.data.switchSides, true); assert.equal(s2.data.cluesW, 333);
  assert.equal(s2.data.clueSource, 'selfServe');
  assert.equal(s2.data.highlightEntry, false);
  assert.equal(s2.data.createClues, true);
  assert.equal(s2.data.usageSharing, true); assert.equal(s2.data.usageConsentVersion, 2); assert.equal(s2.data.telemetryVersion, '3.1.2.0'); assert.equal(s2.data.anonymousId, 'BE-ABCD-EFGH');
  assert.deepEqual([s2.data.add.thin, s2.data.add.speed, s2.data.add.fontSize, s2.data.add.noChat], [true, 0, '24pt', true]);
});

test('invalid or unknown values are ignored', () => {
  const s = new Settings(tmp());
  s.patch({ yellow: 'yes', highlightEntry: 'yes', clueSource: 'unknown', cluesW: -5, resW: 1e9, usageSharing: 'yes', usageConsentVersion: 99, telemetryVersion: 'bad', anonymousId: 'not-valid', bogus: 1, add: { speed: 99, fontSize: '1pt', thin: 'x', __proto__: { polluted: 1 } } });
  assert.equal(s.data.yellow, false); assert.equal(s.data.cluesW, DEFAULTS.cluesW); assert.equal(s.data.resW, DEFAULTS.resW);
  assert.equal(s.data.clueSource, 'lickety');
  assert.equal(s.data.highlightEntry, true);
  assert.equal(s.data.usageSharing, null); assert.equal(s.data.usageConsentVersion, 0); assert.equal(s.data.telemetryVersion, null); assert.equal(s.data.anonymousId, null);
  assert.equal(s.data.add.speed, 3); assert.equal(s.data.add.fontSize, '20pt'); assert.equal(s.data.add.thin, false);
  assert.equal(s.data.bogus, undefined); assert.equal({}.polluted, undefined);
});

test('Create Clues adopts the default for old settings without a recorded choice', () => {
  for (const saved of [{}, { createClues: false }, { createClues: true }, { createClues: false, createCluesUserSet: false }]) {
    const file = tmp();
    fs.writeFileSync(file, JSON.stringify({ ...saved, yellow: true, zoom: 150 }));
    const settings = new Settings(file);
    assert.equal(settings.data.createClues, true);
    assert.equal(settings.data.createCluesUserSet, false);
    assert.equal(settings.data.yellow, true);
    assert.equal(settings.data.zoom, 150);
    settings.flush();
    assert.equal(new Settings(file).data.createClues, true);
  }
});

test('explicit Create Clues choices survive restarts, including choosing the current value', () => {
  const file = tmp(), settings = new Settings(file);
  settings.patch({ createClues: false }); settings.flush();
  const disabled = new Settings(file);
  assert.equal(disabled.data.createClues, false);
  assert.equal(disabled.data.createCluesUserSet, true);
  disabled.patch({ yellow: true }); disabled.flush();
  assert.equal(new Settings(file).data.createClues, false);
  disabled.patch({ createClues: true }); disabled.flush();
  assert.equal(new Settings(file).data.createClues, true);
  const fresh = new Settings(tmp());
  assert.equal(fresh.patch({ createClues: true }), true);
  assert.equal(fresh.data.createCluesUserSet, true);
  fresh.flush();
  assert.equal(new Settings(fresh.file).data.createCluesUserSet, true);
});

test('a corrupt settings file falls back to defaults instead of crashing', () => {
  const f = tmp(); fs.writeFileSync(f, '{ not json');
  assert.equal(new Settings(f).data.cluesW, DEFAULTS.cluesW);
});

test('the last-run version persists locally without enabling usage sharing', () => {
  const f = tmp(), settings = new Settings(f);
  settings.patch({ lastRunVersion: '3.2.2.0' }); settings.flush();
  const restored = new Settings(f);
  assert.equal(restored.data.lastRunVersion, '3.2.2.0');
  assert.equal(restored.data.usageSharing, null);
  restored.patch({ lastRunVersion: 'not-a-version' });
  assert.equal(restored.data.lastRunVersion, '3.2.2.0');
});
