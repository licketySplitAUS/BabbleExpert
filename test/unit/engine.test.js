'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, classify } = require('../../src/engine');

// A fake pair of pages that behaves like the real ones: Clues is a puzzle with a fixed word list
// (AddBabbleWord returns '0' not a clue, '1' newly ticked, '2' already ticked); Babble is a grid.
const GRID = 'ABCDEFGHIJKLMNOPQRSTUVWXY';
function fakePages({ puzzle = ['alpha', 'bravo', 'charlie', 'delta'], grid = [], ticked = [], ready = true, cluesUp = true, cluePuzzleId = 'wrong-id', clueGridLetters = GRID } = {}) {
  const log = { chat: [], added: [], showAll: 0 };
  const pages = {
    log, grid, ticked,
    babble: {
      state: async () => { if (!ready) throw new Error('not on a puzzle'); return { puzzleId: '8097', gridLetters: GRID, remaining: String(puzzle.length - grid.length) }; },
      words: async () => grid.slice(),
      addWord: async w => { if (!puzzle.includes(w)) return `${w} does not exist in the puzzle`; grid.push(w); log.added.push(w); return 'Last word added: ' + w; },
      addChat: async t => { log.chat.push(t); return ''; }
    },
    clues: {
      state: async () => ({ ready: cluesUp, puzzleId: cluePuzzleId, gridLetters: clueGridLetters }),
      ping: async () => { if (!cluesUp) throw new Error('down'); return true; },
      getAllWords: async () => ticked.slice(),
      addBabbleWord: async w => {
        w = w.toLowerCase();
        if (!puzzle.includes(w)) return '0';
        if (ticked.includes(w)) return '2';
        ticked.push(w); return '1';
      },
      showAll: async () => { log.showAll++; }
    }
  };
  return pages;
}
const make = (opts, addOpts = {}) => new Engine({ pages: fakePages(opts), getAddOptions: () => addOpts, pace: 0 });

test('classify: Enter rules from the Delphi Add box', () => {
  assert.equal(classify('   ').kind, 'none');
  assert.equal(classify('cat').kind, 'word');
  assert.equal(classify('ca').kind, 'chat');                       // under 3 letters is chat
  assert.equal(classify('hello there').kind, 'chat');              // spaces => chat
  assert.equal(classify('ca', { noChat: true }).kind, 'word');     // No Chat forces word
  assert.equal(classify('cat', { ctrl: true }).kind, 'chat');      // Ctrl+Enter forces chat
  assert.deepEqual(classify('  Cat\n', { dontClear: true }), { kind: 'word', word: 'cat', clear: false, keep: 'cat' });
  assert.equal(classify('Cat\n').word, 'cat');
});

test('tick: ready only when Babble shows words-left; send needs Clues too', async () => {
  const e = make();
  assert.equal(e.canSend, false);
  await e.tick();
  assert.equal(e.state.ready, true); assert.equal(e.state.puzzleId, '8097'); assert.equal(e.state.remaining, '4'); assert.equal(e.canSend, true);
  const off = make({ ready: false }); await off.tick(); assert.equal(off.state.ready, false); assert.equal(off.canSend, false);
  const noClues = make({ cluesUp: false }); await noClues.tick(); assert.equal(noClues.state.cluesOk, false); assert.equal(noClues.canSend, false);
});

test('sendToBabble: sends ticked words that are missing from the grid, no duplicates', async () => {
  const pages = fakePages({ grid: ['alpha'], ticked: ['alpha', 'bravo', 'charlie'] });
  const e = new Engine({ pages, pace: 0 }); await e.tick();
  const progress = []; e.on('progress', p => progress.push(p.value));
  const r = await e.sendToBabble();
  assert.equal(r.sent, 2);
  assert.deepEqual(pages.log.added, ['bravo', 'charlie']);
  assert.deepEqual(pages.grid, ['alpha', 'bravo', 'charlie']);
  assert.equal(progress.includes(3), true);
  assert.equal(e.state.busy, false);
});

test('sendToBabble: nothing ticked is a friendly no-op', async () => {
  const e = make(); await e.tick(); const msgs = []; e.on('status', m => msgs.push(m));
  assert.equal((await e.sendToBabble()).sent, 0);
  assert.match(msgs[0], /No ticked/);
});

test('getFromBabble: ticks grid words that are clues, ignores the rest, refreshes the page', async () => {
  const pages = fakePages({ grid: ['alpha', 'zzzz', 'delta'] });
  const e = new Engine({ pages, pace: 0 }); await e.tick();
  const r = await e.getFromBabble();
  assert.deepEqual(r, { total: 3, added: 2 });
  assert.deepEqual(pages.ticked, ['alpha', 'delta']);
  assert.equal(pages.log.showAll, 1);
});

test('getFromBabble: a failing page reports the error and never leaves the app busy', async () => {
  const pages = fakePages(); pages.babble.words = async () => { throw new Error('boom'); };
  const e = new Engine({ pages, pace: 0 }); await e.tick(); const msgs = []; e.on('status', m => msgs.push(m));
  const r = await e.getFromBabble();
  assert.equal(r.error, 'boom'); assert.match(msgs.at(-1), /Could not read Babble: boom/); assert.equal(e.state.busy, false);
});

test('busy guard: a second send while one is running is ignored', async () => {
  const pages = fakePages({ ticked: ['alpha', 'bravo'] });
  let release, calls = 0; pages.babble.words = () => ++calls === 1 ? new Promise(r => { release = () => r([]); }) : Promise.resolve([]);
  const e = new Engine({ pages, pace: 0 });
  await e.tick();
  const first = e.sendToBabble();
  await new Promise(r => setImmediate(r));
  assert.equal((await e.sendToBabble()).skipped, true);
  release(); await first;
});

test('submit: word => Clues (green) and Babble; colours for 0/1/2', async () => {
  const pages = fakePages(); const e = new Engine({ pages, pace: 0 }); await e.tick();
  let r = await e.submit('Alpha');
  assert.equal(r.color, 'green'); assert.deepEqual(pages.log.added, ['alpha']);
  r = await e.submit('alpha'); assert.equal(r.color, 'amber'); assert.deepEqual(pages.log.added, ['alpha']);   // already in grid: not sent again
  r = await e.submit('zzzzz'); assert.equal(r.color, 'red');                                                    // not a clue
  assert.equal(pages.log.showAll >= 3, true);
});

test('submit: Babble overrides a stale clue source for accepted and existing words', async () => {
  const pages = fakePages({ puzzle: ['oldword'] });
  pages.babble.addWord = async w => { pages.grid.push(w); pages.log.added.push(w); return `Last word added: "${w}"`; };
  const e = new Engine({ pages, pace: 0 }); await e.tick();

  assert.equal((await e.submit('today')).color, 'green');
  assert.equal((await e.submit('today')).color, 'amber');
});

test('submit: 3-letter word cannot show an accepted green result', async () => {
  const pages = fakePages({ puzzle: ['cat'] }); const e = new Engine({ pages, pace: 0 }); await e.tick();
  const r = await e.submit('cat'); assert.equal(r.color, 'red'); assert.deepEqual(pages.log.added, []);
});

test('submit: chat goes to Babble chat; Ctrl forces chat even for one word', async () => {
  const pages = fakePages(); const e = new Engine({ pages, pace: 0 }); await e.tick();
  assert.equal((await e.submit('hi there team')).kind, 'chat');
  assert.equal((await e.submit('alpha', true)).kind, 'chat');
  assert.deepEqual(pages.log.chat, ['hi there team', 'alpha']);
});

test('submit: Babble not ready => say so, still ticks the clue', async () => {
  const pages = fakePages({ ready: false }); const e = new Engine({ pages, pace: 0 }); await e.tick();
  const msgs = []; e.on('status', m => msgs.push(m));
  const r = await e.submit('bravo');
  assert.equal(r.color, 'amber'); assert.equal(r.outcome, 'clues-only'); assert.deepEqual(pages.ticked, ['bravo']); assert.match(msgs.join('|'), /Babble not ready/);
  const c = await e.submit('hello world'); assert.equal(c.sent, false);
});

test('submit: Clues page down does not turn a confirmed Babble word red', async () => {
  const pages = fakePages(); pages.clues.addBabbleWord = async () => { throw new Error('gone'); };
  const e = new Engine({ pages, pace: 0 }); await e.tick(); const msgs = []; e.on('status', m => msgs.push(m));
  assert.equal((await e.submit('alpha')).color, 'green'); assert.match(msgs.join('|'), /Clues not updated/);
});

test('different tile order and unreadable grids block bulk transfer in both directions', async () => {
  for (const clueGridLetters of [GRID.split('').reverse().join(''), '']) {
    const pages = fakePages({ ticked: ['bravo'], clueGridLetters });
    const e = new Engine({ pages, pace: 0 }); await e.tick();
    assert.equal(e.canSend, false);
    assert.equal((await e.sendToBabble()).skipped, true);
    assert.equal((await e.getFromBabble()).skipped, true);
    assert.deepEqual(pages.log.added, []);
  }
});

test('matching grids allow transfer even when the Clues puzzle number is wrong', async () => {
  const e = make({ cluePuzzleId: '1' }); await e.tick();
  assert.equal(e.state.puzzleMatch, true);
  assert.equal(e.canSend, true);
});

test('rapid entries are processed in order and kept in recoverable history', async () => {
  const pages = fakePages(), e = new Engine({ pages, pace: 0 }); await e.tick();
  let release, running = 0, maximum = 0;
  pages.babble.addWord = async word => {
    running++; maximum = Math.max(maximum, running);
    if (word === 'alpha') await new Promise(resolve => { release = resolve; });
    running--; return word === 'alpha' ? 'Last word added: alpha' : 'bravo does not exist in the puzzle';
  };
  const first = e.submit('alpha'), second = e.submit('bravo');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.state.pending, 2);
  assert.equal(e.history.length, 2);
  release();
  assert.equal((await first).outcome, 'added');
  assert.equal((await second).outcome, 'rejected');
  assert.equal(maximum, 1);
  assert.equal(e.state.pending, 0);
  assert.equal(e.history[0].text, 'bravo');
});

test('Babble rejection overrides a positive clue result, and timeout is not invalid', async () => {
  const pages = fakePages(), e = new Engine({ pages, pace: 0 }); await e.tick();
  pages.babble.addWord = async () => 'alpha does not exist in the puzzle';
  assert.equal((await e.submit('alpha')).color, 'red');
  pages.babble.addWord = async () => '';
  const result = await e.submit('bravo');
  assert.equal(result.color, 'amber');
  assert.equal(result.sent, false);
  assert.equal(result.outcome, 'clues-only');
});

test('failed chat remains recoverable and is not reported sent', async () => {
  const pages = fakePages(), e = new Engine({ pages, pace: 0 }); await e.tick();
  let calls = 0;
  pages.babble.addChat = async () => { calls++; throw new Error('offline'); };
  const result = await e.submit('hello there');
  assert.equal(result.sent, false);
  assert.equal(e.history[0].text, 'hello there');
  assert.equal(calls, 1);
});

test('bulk summary counts confirmed additions, rejections and uncertain results separately', async () => {
  const pages = fakePages({ ticked: ['alpha', 'bravo', 'charlie'] });
  const e = new Engine({ pages, pace: 0 }); await e.tick();
  pages.babble.addWord = async word => word === 'alpha' ? 'Last word added: alpha' : word === 'bravo' ? 'bravo does not exist in the puzzle' : '';
  assert.deepEqual(await e.sendToBabble(), { sent: 1, rejected: 1, unconfirmed: 1 });
});
