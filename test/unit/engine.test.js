'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, classify } = require('../../src/engine');

test('list detection uses board paths, sorted words and repeated separators', () => {
  const gridLetters = 'BRAVOALPHADELTACHARLIEXXX';
  for (const text of ['alpha bravo delta', 'ALPHA BRAVO DELTA', 'alpha bravo delta zzzz']) {
    assert.equal(classify(text, { gridLetters }).kind, 'blocked', text);
    assert.equal(classify(text, { gridLetters, ctrl: true }).kind, 'chat');
  }
  for (const text of ['alpha bravo charlie delta echo', 'alpha, bravo, charlie, delta', 'alpha; bravo; charlie; delta', 'alpha\tbravo\tcharlie\tdelta']) {
    assert.equal(classify(text).kind, 'blocked', text);
    assert.equal(classify(text, { noChat: true }).kind, 'blocked');
  }
  for (const text of ['good luck all', 'hello there friends', 'hello, everyone', 'thanks everyone, this puzzle feels tricky!', 'alpha bravo are my last words', 'I have four words left']) {
    assert.equal(classify(text, { gridLetters }).kind, 'chat', text);
  }
  // Without a board, short unstructured messages are not guessed to be lists.
  assert.equal(classify('hello there friends').kind, 'chat');
  assert.equal(classify('alpha', { gridLetters }).kind, 'word');
  assert.equal(classify('hello there', { noChat: true }).kind, 'word');
});

test('engine holds board-like lists without sending and allows an explicit chat override', async () => {
  const pages = fakePages(), e = new Engine({ pages, pace: 0 });
  await e.tick();
  e.state.gridLetters = 'BRAVOALPHADELTACHARLIEXXX';
  const result = await e.submit('alpha bravo delta');
  assert.equal(result.kind, 'blocked');
  assert.equal(result.clear, false);
  assert.deepEqual(pages.log.chat, []);
  assert.deepEqual(pages.log.added, []);
  assert.equal((await e.submit('alpha bravo delta', true)).sent, true);
  assert.deepEqual(pages.log.chat, ['alpha bravo delta']);
});

test('word lists and oversized entries cannot reach chat or word submission, even with Ctrl or No Chat', async () => {
  for (const noChat of [false, true]) {
    const pages = fakePages(), e = new Engine({ pages, pace: 0, getAddOptions: () => ({ noChat }) });
    await e.tick();
    for (const ctrl of [false, true]) {
      for (const text of ['alpha\nbravo', 'alpha\rbravo', 'alpha\r\nbravo', 'alpha\u2028bravo', 'a'.repeat(501)]) {
        const result = await e.submit(text, ctrl);
        assert.equal(result.kind, 'blocked');
        assert.equal(result.sent, false);
        assert.equal(result.clear, false);
      }
    }
    assert.deepEqual(pages.log.chat, []);
    assert.deepEqual(pages.log.added, []);
    assert.deepEqual(pages.ticked, []);
    assert.equal(e.state.pending, 0);
  }
});

test('ordinary Enter sends conversational text to chat', async () => {
  const pages = fakePages(), e = new Engine({ pages, pace: 0 });
  await e.tick();
  assert.equal((await e.submit('good luck all')).kind, 'chat');
  assert.deepEqual(pages.log.chat, ['good luck all']);
  assert.equal((await e.submit('hello everyone', true)).sent, true);
  assert.equal((await e.submit('a'.repeat(500), true)).sent, true);
});

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

test('duplicate and short word attempts still populate the Babble entry', async () => {
  const e = make({ grid: ['alpha'] }), entries = [];
  e.pages.babble.setWordEntry = async word => entries.push(word);
  await e.tick();
  assert.equal((await e.submit('alpha')).outcome, 'duplicate');
  assert.equal((await e.submit('cat')).outcome, 'rejected');
  assert.deepEqual(entries, ['alpha', 'cat']);
});

test('classify: Enter rules from the Delphi Add box', () => {
  assert.equal(classify('   ').kind, 'none');
  assert.equal(classify('cat').kind, 'word');
  assert.equal(classify('ca').kind, 'chat');                       // short text is chat
  assert.equal(classify('hello there').kind, 'chat');              // ordinary sentences go to chat
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

test('loading saved Babble words blocks syncing and journal snapshots even when the puzzle is visible', async () => {
  const pages=fakePages({ticked:['alpha']});
  const state=pages.babble.state;
  pages.babble.state=async()=>({...await state(),wordListReady:false});
  const engine=new Engine({pages,pace:0,observeProgress:()=>true}),snapshots=[];
  engine.on('puzzle-progress',snapshot=>snapshots.push(snapshot));
  await engine.tick();await engine.syncNativeWords();
  assert.equal(engine.state.ready,false);assert.equal(engine.state.babbleConnection,'loading');
  assert.equal(snapshots[0].ready,false);assert.deepEqual(pages.log.added,[]);
  pages.babble.state=state;
  await engine.tick();await engine.syncNativeWords();
  assert.deepEqual(pages.log.added,['alpha']);
});

test('a refresh invalidates an old transfer even when the same puzzle becomes ready again', async()=>{
  const engine=make();await engine.tick();const valid=engine.transferContext();
  engine.babblePageChanged();await engine.tick();
  assert.equal(engine.state.ready,true);assert.equal(valid(),false);
  const entries=[];engine.pages.babble.setWordEntry=async word=>entries.push(word);
  engine.pages.grid.push('alpha');
  assert.equal(await engine.addToBabble('alpha',()=>true,{showExistingEntry:false}),'duplicate');
  assert.deepEqual(entries,[]);
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

test('a saved word missing from the display is recovered without resubmitting', async () => {
  for (const reply of ['Last word added: alpha', 'Already entered: alpha', '']) {
    const pages = fakePages({ ticked: ['alpha'] });
    let submissions = 0, repairs = 0;
    pages.babble.addWord = async () => { submissions++; return reply; };
    pages.babble.refreshWords = async identity => {
      assert.equal(identity.puzzleId, '8097'); assert.equal(identity.gridLetters, GRID);
      repairs++; pages.grid.push('alpha');
    };
    const engine = new Engine({ pages, pace: 0 }); await engine.tick();
    const result = await engine.sendToBabble();
    assert.equal(result.unconfirmed, 0);
    assert.equal(submissions, 1); assert.equal(repairs, 1);
    assert.deepEqual(pages.grid, ['alpha']);
  }
});

test('a success message without a visible or recoverable word stays unconfirmed', async () => {
  const pages = fakePages({ ticked: ['alpha', 'bravo'] });
  pages.babble.addWord = async () => 'Last word added: alpha';
  pages.babble.refreshWords = async () => { throw Error('offline'); };
  const engine = new Engine({ pages, pace: 0 }); await engine.tick();
  assert.deepEqual(await engine.sendToBabble(), { sent: 0, rejected: 0, unconfirmed: 1 });
  assert.equal(engine.state.busy, false);
});

test('a callback error can recover a saved word, but a puzzle change cannot confirm it', async () => {
  const pages = fakePages();
  pages.babble.addWord = async () => { throw Error('page update failed'); };
  const engine = new Engine({ pages, pace: 0 }); await engine.tick();
  pages.babble.refreshWords = async () => { pages.grid.push('alpha'); };
  assert.equal(await engine.addToBabble('alpha'), 'added');
  let valid = true;
  pages.babble.refreshWords = async () => { pages.grid.push('bravo'); valid = false; };
  assert.equal(await engine.addToBabble('bravo', () => valid), 'unconfirmed');
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

test('long Create Clues messages can be explicitly sent while Add entry limits remain enforced', async () => {
  const pages = fakePages(), e = new Engine({ pages, pace: 0 }); await e.tick();
  const clue = 'st4,4 : ' + 'A complete definition with its original ending. '.repeat(20);
  assert.equal((await e.submit(clue, true)).sent, false, 'Ordinary Add Ctrl+Enter keeps its 500-character limit');
  assert.equal((await e.submit(clue, true, { maxLength: 20000 })).sent, true);
  assert.deepEqual(pages.log.chat, [clue.trim()]);
  assert.equal((await e.submit(clue + '\nsecond line', true, { maxLength: 20000 })).sent, false);
  assert.equal((await e.submit('x'.repeat(20001), true, { maxLength: 20000 })).sent, false);
  assert.equal(pages.log.chat.length, 1);
});

test('submit: unknown puzzle identity preserves an unconfirmed entry without ticking another puzzle', async () => {
  const pages = fakePages({ ready: false }); const e = new Engine({ pages, pace: 0 }); await e.tick();
  const msgs = []; e.on('status', m => msgs.push(m));
  const r = await e.submit('bravo');
  assert.equal(r.color, 'amber'); assert.equal(r.outcome, 'unconfirmed'); assert.deepEqual(pages.ticked, []); assert.match(msgs.join('|'), /Could not confirm/);
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
    running--; if (word === 'alpha') pages.grid.push(word);
    return word === 'alpha' ? 'Last word added: alpha' : 'bravo does not exist in the puzzle';
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
  const result = await e.submit('hello there', true);
  assert.equal(result.sent, false);
  assert.equal(e.history[0].text, 'hello there');
  assert.equal(calls, 1);
});

test('bulk summary counts confirmed additions, rejections and uncertain results separately', async () => {
  const pages = fakePages({ ticked: ['alpha', 'bravo', 'charlie'] });
  const e = new Engine({ pages, pace: 0 }); await e.tick();
  pages.babble.addWord = async word => {
    if (word === 'alpha') { pages.grid.push(word); return 'Last word added: alpha'; }
    return word === 'bravo' ? 'bravo does not exist in the puzzle' : '';
  };
  assert.deepEqual(await e.sendToBabble(), { sent: 1, rejected: 1, unconfirmed: 1 });
});


test('native reconciliation includes existing words and does not echo accepted words', async () => {
  const e = make({ grid: ['alpha'] });
  await e.tick(); await e.syncNativeWords();
  assert.deepEqual(e.pages.ticked, ['alpha']);
  e.pages.grid.push('bravo');
  await e.syncNativeWords();
  assert.deepEqual(e.pages.ticked, ['alpha', 'bravo']);
  e.pages.ticked.push('charlie');
  await e.syncNativeWords(); await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, ['charlie']);
  assert.equal(e.pages.grid.filter(w => w === 'bravo').length, 1);
});

test('native syncing waits for matching puzzles and retries transient errors', async () => {
  const e = make(); await e.tick(); await e.syncNativeWords();
  e.pages.ticked.push('delta');
  e._set({ puzzleMatch: false }); await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, []);
  e._set({ puzzleMatch: true });
  const add = e.pages.babble.addWord;
  e.pages.babble.addWord = async () => { throw new Error('offline'); };
  await e.syncNativeWords();
  e.pages.babble.addWord = add;
  e._nativeContext.babbleFailures.set('delta', 0);
  await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, ['delta']);
});

test('native reconciliation resets retry state on puzzle changes and waits during submissions', async () => {
  const e = make(); await e.tick(); await e.syncNativeWords();
  e.pages.ticked.push('bravo');
  e._set({ pending: 1 }); await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, []);
  e._set({ pending: 0 }); await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, ['bravo']);
  e._set({ puzzleId: 'next' }); e.pages.ticked.push('delta');
  await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, ['bravo', 'delta']);
});


test('native transfers share the Add queue and keep update installation waiting until idle', async () => {
  const e = make(); await e.tick(); await e.syncNativeWords();
  const add = e.pages.babble.addWord;
  let release;
  e.pages.babble.addWord = async word => { await new Promise(resolve => { release = resolve; }); return add(word); };
  e.pages.ticked.push('bravo');
  const syncing = e.syncNativeWords();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.state.pending, 1);
  const submitting = e.submit('bravo');
  let idle = false;
  const waiting = e.whenIdle().then(() => { idle = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(idle, false);
  release();
  await syncing; await submitting; await waiting;
  assert.deepEqual(e.pages.log.added, ['bravo']);
  assert.equal(e.state.pending, 0);
});


test('reconciliation repairs saved clue words and words lost after a Babble reload', async () => {
  const e = make({ grid: ['alpha'], ticked: ['alpha', 'bravo'] });
  await e.tick(); await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, ['bravo']);
  e.pages.grid.splice(e.pages.grid.indexOf('bravo'), 1);
  await e.syncNativeWords();
  assert.deepEqual(e.pages.log.added, ['bravo', 'bravo']);
});

test('switching clue sources imports existing Babble words after the new grid matches', async () => {
  const e = make({ grid: ['alpha', 'bravo'], ticked: ['alpha', 'bravo'] });
  await e.tick(); await e.syncNativeWords();
  e.cluesPageChanged(); e.pages.ticked.length = 0;
  await e.syncNativeWords();
  assert.deepEqual(e.pages.ticked, []);
  e._set({ cluesOk: true, puzzleMatch: false }); await e.syncNativeWords();
  assert.deepEqual(e.pages.ticked, []);
  e._set({ puzzleMatch: true }); await e.syncNativeWords();
  assert.deepEqual(e.pages.ticked, ['alpha', 'bravo']);
});

test('a rejected or unconfirmed clue word does not starve later words or retry every poll', async () => {
  const e = make({ ticked: ['alpha', 'bravo', 'charlie'] });
  const add = e.pages.babble.addWord;
  const calls = [];
  e.pages.babble.addWord = async word => {
    calls.push(word);
    if (word === 'alpha') return 'alpha does not exist in the puzzle';
    if (word === 'bravo') return '';
    return add(word);
  };
  const messages = []; e.on('status', message => messages.push(message));
  await e.tick(); await e.syncNativeWords(); await e.syncNativeWords();
  assert.deepEqual(calls, ['alpha', 'bravo', 'charlie']);
  assert.deepEqual(e.pages.grid, ['charlie']);
  assert.ok(messages.some(message => message.includes('did not accept alpha')));
  assert.ok(messages.some(message => message.includes('will retry automatically')));
  e._nativeContext.babbleFailures.set('bravo', 0);
  e.pages.babble.addWord = add;
  await e.syncNativeWords();
  assert.deepEqual(e.pages.grid, ['charlie', 'bravo']);
});

test('a clue navigation during sync stops forwarding into the replacement page', async () => {
  const e = make({ grid: ['alpha', 'bravo'] });
  await e.tick();
  const add = e.pages.clues.addBabbleWord;
  e.pages.clues.addBabbleWord = async word => { const result = await add(word); e.cluesPageChanged(); return result; };
  await e.syncNativeWords();
  assert.deepEqual(e.pages.ticked, ['alpha']);
  e.pages.ticked.length = 0;
  e.pages.clues.addBabbleWord = add;
  await e.tick(); await e.syncNativeWords();
  assert.deepEqual(e.pages.ticked, ['alpha', 'bravo']);
});

test('a clue status reply from before a refresh cannot re-enable transfers', async () => {
  const e = make(); await e.tick();
  const state = await e.pages.clues.state();
  let release;
  e.pages.clues.state = () => new Promise(resolve => { release = resolve; });
  const polling = e.tick();
  e.cluesPageChanged();
  release(state); await polling;
  assert.equal(e.state.cluesOk, false);
  assert.equal(e.state.puzzleMatch, null);
  assert.equal(e.canSend, false);
});
