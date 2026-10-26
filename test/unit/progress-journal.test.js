'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { ProgressJournal, journalSnapshot } = require('../../src/progress-journal');
const { Engine } = require('../../src/engine');
const { Settings } = require('../../src/settings');
const state = (words = [], remaining = 3, extra = {}) => ({ ready: true, puzzleId: '8097', gridLetters: 'ABCDEFGHIJKLMNOPQRSTUVWXY', puzzleDate: '2026-10-24', words, remaining, ...extra });
function setup(enabled = true) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'be-journal-')), 'journal.json');
  let time = 0;
  const options = { file, enabled, now: () => Date.parse('2026-10-24T00:00:00Z') + time, clock: () => time };
  return { journal: new ProgressJournal(options), file, options, advance: ms => { time += ms; } };
}
test('journal defaults on, preserves history when paused, and settings survive restart', () => {
  const { journal, file } = setup(false);
  assert.equal(journal.observe(state()), false); journal.flush(); assert.equal(fs.existsSync(file), false);
  journal.setEnabled(true); journal.observe(state()); journal.setEnabled(false);
  assert.equal(journal.view().records.length, 1); assert.equal(journal.observe(state(['alpha'])), false);
  const settings = new Settings(file + '.settings'); assert.equal(settings.data.journalEnabled, true);
  settings.patch({ journalEnabled: false }); settings.flush(); assert.equal(new Settings(file + '.settings').data.journalEnabled, false);
  journal.flush();
});
test('counts confirmed distinct words, completion and active time without collecting the board or full word list', () => {
  const { journal, advance, file } = setup();
  journal.observe(state(), { active: true }); advance(1000);
  journal.observe(state(['alpha', 'ALPHA'], 2), { active: true }); advance(1000);
  journal.observe(state(['alpha', 'bravo', 'charlie'], 0), { active: true }); advance(1000);
  journal.observe(state(['alpha', 'bravo', 'charlie'], 0), { active: true });
  const row = journal.view().records[0];
  assert.deepEqual(row.byLength, { 5: 2, 7: 1 }); assert.deepEqual(row.longest, ['charlie']);
  assert.equal(row.activeMs, 2000); assert.equal(row.completionObserved, true); assert.equal(row.partial, false);
  journal.flush(); const saved = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(saved, /ABCDEFGHIJKLMNOPQRSTUVWXY|alpha|bravo|anonymous|chat|password/);
  assert.match(journal.csv(), /Recorded active seconds/); assert.match(journal.csv(), /charlie/);
});
test('foreground timing excludes pause, sleep gaps, disconnected pages and time between launches', () => {
  const { journal, advance, options } = setup();
  journal.observe(state(), { active: true }); advance(1000); journal.suspend();
  advance(2000); journal.observe(state(), { active: true }); advance(600000); journal.observe(state(['alpha'], 2), { active: true });
  advance(1000); journal.observe({ ready: false }); advance(10000); journal.observe(state(['alpha'], 2), { active: false });
  journal.flush(); assert.equal(journal.view().records[0].activeMs, 2000);
  advance(86400000);
  const next = new ProgressJournal(options); next.observe(state(['alpha', 'bravo'], 1), { active: true }); advance(1000); next.observe(state(['alpha', 'bravo'], 1), { active: true });
  assert.equal(next.view().records[0].activeMs, 3000); assert.equal(next.view().records[0].partial, true); next.flush();
});
test('partial starts and puzzles already complete do not claim a full timed completion', () => {
  const { journal, advance } = setup();
  journal.observe(state(['alpha'], 2), { active: true }); advance(1000); journal.observe(state(['alpha', 'bravo', 'charlie'], 0), { active: true });
  assert.equal(journal.view().records[0].partial, true); assert.equal(journal.view().records[0].initialFound, 1);
  journal.observe(state(['alpha'], 0, { puzzleId: '8098' }));
  const complete = journal.view().records.find(row => row.puzzleId === '8098');
  assert.equal(complete.completionObserved, false); assert.equal(complete.activeMs, 0); journal.flush();
});
test('new grids have independent records; invalid snapshots and changing accounts cannot inflate counts', () => {
  const { journal } = setup();
  journal.observe(state(['alpha'], 2)); journal.observe(state(['bravo'], 2));
  assert.equal(journal.view().records[0].found, 1);
  journal.observe(state([], 3, { gridLetters: 'ZBCDEFGHIJKLMNOPQRSTUVWXY' }));
  assert.equal(journal.view().records.length, 2);
  for (const bad of [state(['private words'], 1), state([], -1), state([], 1, { gridLetters: 'bad' }), state([], 1, { puzzleId: 'private user' }), state([], 0)]) assert.equal(journalSnapshot(bad), null);
  journal.flush();
});
test('unreadable journal files are preserved until explicitly cleared, and records survive atomic writes', () => {
  const { journal, file, options } = setup(); journal.observe(state(['alpha'], 2)); journal.flush();
  assert.equal(new ProgressJournal(options).view().records[0].found, 1);
  fs.writeFileSync(file, 'invalid private file');
  const broken = new ProgressJournal(options); assert.equal(broken.blocked, true); assert.equal(broken.observe(state()), false); broken.flush();
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid private file'); assert.throws(() => broken.csv());
  assert.equal(broken.clear(), true); assert.equal(new ProgressJournal(options).view().records.length, 0);
});
test('journal word snapshots are optional and independent of Clues availability', async () => {
  let enabled = false, requested = [];
  const pages = { babble: { state: async includeWords => { requested.push(includeWords); return { ...state(['alpha'], 2), hasAddWord: true }; } }, clues: { state: async () => { throw Error('offline'); } } };
  const engine = new Engine({ pages, observeProgress: () => enabled }), snapshots = [];
  engine.on('puzzle-progress', data => snapshots.push(data));
  await engine.tick(); assert.deepEqual(requested, [false]); assert.equal(snapshots.length, 0);
  enabled = true; await engine.tick(); assert.equal(requested[1], true); assert.deepEqual(snapshots[0].words, ['alpha']);
  assert.equal(snapshots[0].ready, true); assert.equal(engine.state.cluesOk, false); assert.equal(engine.state.words, undefined);
});

test('official word-total corrections reopen incomplete puzzles and survive restart', () => {
  const { journal, options } = setup();
  journal.observe(state(['alpha', 'bravo', 'charlie'], 0));
  journal.observe(state(['alpha', 'bravo', 'charlie'], 1));
  let row = journal.view().records[0];
  assert.equal(row.completedAt, null); assert.equal(row.completionObserved, false);
  assert.equal(row.total, 4); assert.equal(row.partial, true);
  journal.observe(state(['alpha', 'bravo'], 0)); journal.flush();
  row = new ProgressJournal(options).view().records[0];
  assert.equal(row.found, 2); assert.equal(row.total, 2); assert.equal(row.initialFound, 3);
  assert.ok(row.completedAt); assert.equal(row.completionObserved, false);
});

test('a slow Clues probe cannot delay the local progress snapshot', async () => {
  let release;
  const probe = new Promise(resolve => { release = resolve; });
  const engine = new Engine({ observeProgress: () => true, pages: {
    babble: { state: async () => ({ ...state(['alpha'], 2), hasAddWord: true }) },
    clues: { state: () => probe }
  } });
  let complete = false;
  const observed = new Promise(resolve => engine.once('puzzle-progress', resolve));
  const tick = engine.tick().then(() => { complete = true; });
  assert.deepEqual((await observed).words, ['alpha']); assert.equal(complete, false);
  release({ ready: false }); await tick;
});

test('journal retention is bounded and only documented fields survive restore', () => {
  const { journal, file, options } = setup();
  for (let i = 1; i <= 2001; i++) journal.observe(state([], 3, { puzzleId: String(i) }));
  journal.flush();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.records.length, 2000); assert.equal(saved.records[0].puzzleId, '2');
  saved.records[0].privateUnexpectedField = 'not part of the schema';
  fs.writeFileSync(file, JSON.stringify(saved));
  const restored = new ProgressJournal(options);
  assert.equal(restored.blocked, false); assert.equal(restored.view().records[0].privateUnexpectedField, undefined);
  assert.doesNotMatch(restored.csv(), /not part of the schema/);
});
