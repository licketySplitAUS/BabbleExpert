'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, classify } = require('../../src/engine');

// A fake pair of pages that behaves like the real ones: Clues is a puzzle with a fixed word list
// (AddBabbleWord returns '0' not a clue, '1' newly ticked, '2' already ticked); Babble is a grid.
function fakePages({ puzzle = ['alpha', 'bravo', 'charlie', 'delta'], grid = [], ticked = [], ready = true, cluesUp = true } = {}) {
  const log = { chat: [], added: [], showAll: 0 };
  const pages = {
    log, grid, ticked,
    babble: {
      state: async () => { if (!ready) throw new Error('not on a puzzle'); return { puzzleId: '8097', remaining: String(puzzle.length - grid.length) }; },
      words: async () => grid.slice(),
      addWord: async w => { grid.push(w); log.added.push(w); return 'ok:' + w; },
      addChat: async t => { log.chat.push(t); return ''; }
    },
    clues: {
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
  const e = new Engine({ pages, pace: 0 }); const msgs = []; e.on('status', m => msgs.push(m));
  const r = await e.getFromBabble();
  assert.equal(r.error, 'boom'); assert.match(msgs.at(-1), /Could not read Babble: boom/); assert.equal(e.state.busy, false);
});

test('busy guard: a second send while one is running is ignored', async () => {
  const pages = fakePages({ ticked: ['alpha', 'bravo'] });
  let release; pages.babble.words = () => new Promise(r => { release = () => r([]); });
  const e = new Engine({ pages, pace: 0 });
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

test('submit: 3-letter word goes to Clues only (Babble needs 4+)', async () => {
  const pages = fakePages({ puzzle: ['cat'] }); const e = new Engine({ pages, pace: 0 }); await e.tick();
  const r = await e.submit('cat'); assert.equal(r.color, 'green'); assert.deepEqual(pages.log.added, []);
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
  assert.equal(r.color, 'green'); assert.deepEqual(pages.ticked, ['bravo']); assert.match(msgs.join('|'), /Babble not ready/);
  const c = await e.submit('hello world'); assert.equal(c.sent, false);
});

test('submit: Clues page down => red flash and a message, no crash', async () => {
  const pages = fakePages(); pages.clues.addBabbleWord = async () => { throw new Error('gone'); };
  const e = new Engine({ pages, pace: 0 }); await e.tick(); const msgs = []; e.on('status', m => msgs.push(m));
  assert.equal((await e.submit('alpha')).color, 'red'); assert.match(msgs.join('|'), /Clues page not ready/);
});
