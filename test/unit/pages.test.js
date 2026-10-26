'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makePages, readGridLetters } = require('../../src/pages');
const vm = require('node:vm');

// Fake webContents that records what would be run and returns what we tell it to.
function fakeWc(url, { loading = false, result = undefined, destroyed = false } = {}) {
  const wc = { ran: [], getURL: () => url, isLoading: () => loading, isDestroyed: () => destroyed, executeJavaScript: async code => { wc.ran.push(code); return typeof result === 'function' ? result(code) : result; } };
  return wc;
}
const mk = (b, c) => makePages({ getBabble: () => b, getClues: () => c, babbleHosts: ['playbabble.com', 'www.playbabble.com'], cluesHosts: ['r46.me', 'selfserve.r46.me'] });

test('grid signatures preserve tile order and normalize Qu on both clue layouts', () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXY';
  const images = [...letters].map(letter => ({ getAttribute: name => name === 'src' ? `/${letter === 'Q' ? 'qu' : letter.toLowerCase()}.gif?v=1` : `addLetter('${letter}');` }));
  const table = { rows: Array.from({ length: 5 }, (_, row) => ({ cells: images.slice(row * 5, row * 5 + 5).map(img => ({ querySelector: () => img })) })) };
  for (const layout of ['selfServe', 'table', 'legacy']) {
    const document = { querySelectorAll: selector => selector === '.board button img' && layout === 'selfServe' ? images
      : selector === 'table' && layout === 'table' ? [table] : selector === 'img[onclick]' && layout === 'legacy' ? images : [] };
    assert.equal(readGridLetters(document), letters);
  }
  assert.equal(readGridLetters({ querySelectorAll: () => [] }), '', 'missing tiles cannot be declared a match');
});

test('scripts only run on the expected websites', async () => {
  const evil = fakeWc('https://evil.example/x'); const clues = fakeWc('https://r46.me/babbleclues.html', { result: true });
  const p = mk(evil, clues);
  await assert.rejects(p.babble.state(), /expected website/);
  await assert.rejects(p.babble.addWord('x'), /expected website/);
  await assert.rejects(p.babble.fireworks('void 0'), /expected website/);
  assert.equal(evil.ran.length, 0);
  assert.equal(await p.clues.ping(), true);
  await assert.rejects(mk(null, fakeWc('https://evil.example/')).clues.fireworks('void 0'), /expected website/);
});

test('host check is exact: lookalike hosts are refused', async () => {
  for (const u of ['https://playbabble.com.evil.io/', 'https://notplaybabble.com/', 'about:blank', 'file:///x'])
    await assert.rejects(mk(fakeWc(u), fakeWc('https://r46.me/')).babble.words(), /expected website/);
});

test('page still loading / destroyed / missing are errors, not hangs', async () => {
  await assert.rejects(mk(fakeWc('https://playbabble.com/', { loading: true }), null).babble.state(), /still loading/);
  await assert.rejects(mk(fakeWc('https://playbabble.com/', { destroyed: true }), null).babble.state(), /not available/);
  await assert.rejects(mk(null, null).babble.state(), /not available/);
});

test('words and arguments are passed as data, never spliced in as code', async () => {
  const wc = fakeWc('https://playbabble.com/', { result: '' }); const p = mk(wc, null);
  const nasty = `x');alert(1);//"\\`;
  await p.babble.addWord(nasty); await p.babble.addChat('line1\nline2 "q" \u2028');
  const code = wc.ran.join('\n');
  assert.ok(code.includes(JSON.stringify(nasty)));
  for (const c of wc.ran) assert.doesNotThrow(() => new Function(c), 'generated script must be valid JavaScript');
});

test('clues: only the three known functions can be called; GetAllWords is split into lines', async () => {
  const wc = fakeWc('https://r46.me/babbleclues.html', { result: 'alpha\nbravo\n' }); const p = mk(null, wc);
  assert.deepEqual(await p.clues.getAllWords(), ['alpha', 'bravo']);
  const { CLUES_FUNCTIONS } = require('../../src/pages'); assert.deepEqual(CLUES_FUNCTIONS, ['GetAllWords', 'AddBabbleWord', 'showAll']);
});

test('Self Serve exposes the same guarded Clues API', async () => {
  const wc = fakeWc('https://selfserve.r46.me/', { result: 'alpha\nbravo\n' }); const p = mk(null, wc);
  assert.deepEqual(await p.clues.getAllWords(), ['alpha', 'bravo']);
  assert.equal(wc.ran.length, 1);
});

test('Babble submissions populate the real word entry even when AddWord ignores its argument', async () => {
  const input = name => ({ name, id: '', type: 'text', value: 'old draft', form: null,
    closest: () => null, getAttribute: () => '', dispatchEvent() {} });
  const chat = input('add_message'), search = input('find_word'), entry = input('add_word');
  let received = '';
  const context = vm.createContext({ document: { querySelectorAll: () => [chat, search, entry] }, Event: class {}, setTimeout, clearTimeout });
  context.window = context;
  context.AddWord = () => { received = entry.value; return 'Last word added: ' + entry.value; };
  const wc = fakeWc('https://playbabble.com/', { result: code => vm.runInContext(code, context) });
  assert.equal(await mk(wc, null).babble.addWord('bravo'), 'Last word added: bravo');
  assert.equal(received, 'bravo');
  assert.equal(search.value, 'old draft');
  assert.equal(chat.value, 'old draft');
});

test('sync refresh preserves Self Serve and published React filters, while still refreshing legacy Clues', async () => {
  for (const layout of ['selfServe', 'published', 'legacy']) {
    let calls = 0;
    const context = { document: { querySelector: selector => {
      const markers = layout === 'selfServe' ? ['button.grabgrid'] : layout === 'published' ? ['.showline input[name="view"]'] : [];
      return markers.some(marker => selector.split(',').map(value => value.trim()).includes(marker)) ? {} : null;
    } }, window: { showAll: () => { calls++; return ''; } } };
    const wc = fakeWc(layout === 'selfServe' ? 'https://selfserve.r46.me/' : 'https://r46.me/babbleclues.html', {
      result: code => vm.runInNewContext(code, context)
    });
    await mk(null, wc).clues.showAll();
    assert.equal(calls, layout === 'legacy' ? 1 : 0, layout);
  }
});

test('asynchronous Babble callbacks stay associated with their queued words', async () => {
  let message = '', active = 0, maximum = 0;
  const context = vm.createContext({ setTimeout, clearTimeout, document: { getElementById: () => ({ textContent: message }) } });
  context.window = context;
  const original = response => { message = response; active--; };
  context.AddWordPostOp = original;
  context.AddWord = word => {
    active++; maximum = Math.max(maximum, active);
    const callback = context.AddWordPostOp;
    setTimeout(() => callback(word === 'alpha' ? 'Last word added: alpha' : 'bravo does not exist in the puzzle'), word === 'alpha' ? 30 : 5);
  };
  const wc = fakeWc('https://playbabble.com/', { result: code => vm.runInContext(code, context) });
  const pages = mk(wc, null);
  assert.deepEqual(await Promise.all([pages.babble.addWord('alpha'), pages.babble.addWord('bravo')]), ['Last word added: alpha', 'bravo does not exist in the puzzle']);
  assert.equal(maximum, 1);
  assert.equal(context.AddWordPostOp, original);
});

test('an unrelated word response does not finish the pending Expert submission', async () => {
  let message = '';
  const context = vm.createContext({ setTimeout, clearTimeout, document: { getElementById: () => ({ textContent: message }) } });
  context.window = context;
  context.AddWordPostOp = response => { message = JSON.parse(response.responseText).message; };
  context.AddWord = () => {
    const callback = context.AddWordPostOp;
    setTimeout(() => callback({ responseText: JSON.stringify({ word: 'other', message: 'other does not exist in the puzzle' }) }), 1);
    setTimeout(() => callback({ responseText: JSON.stringify({ word: 'alpha', message: 'Last word added: alpha' }) }), 10);
  };
  const pages = mk(fakeWc('https://playbabble.com/', { result: code => vm.runInContext(code, context) }), null);
  assert.equal(await pages.babble.addWord('alpha'), 'Last word added: alpha');
});

test('normal Babble status polling does not serialize the whole page', async () => {
  const document = {
    getElementById: id => id === 'total_words_left' ? { textContent: '100' } : null,
    querySelectorAll: () => [],
    querySelector: selector => selector === 'a[href*="chat_log"]' ? { getAttribute: () => '/8613/17/10/2026/chat_log' } : null,
    documentElement: { get outerHTML() { throw Error('Full document serialization should not occur'); } }
  };
  const wc = fakeWc('https://playbabble.com/', { result: code => vm.runInNewContext(code, { document, window: { AddWord() {} } }) });
  const state = await mk(wc, null).babble.state();
  assert.equal(state.puzzleId, '8613'); assert.equal(state.remaining, '100');
});

test('optional journal snapshots work with Babble Prototype replacing Array.from', async () => {
  let wordReads = 0;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXY';
  const table = { rows: Array.from({ length: 5 }, (_, row) => ({ cells: [...letters.slice(row * 5, row * 5 + 5)].map(letter => ({
    querySelector: () => ({ getAttribute: () => `/images/${letter.toLowerCase()}.gif` })
  })) })) };
  const document = {
    getElementById: id => id === 'total_words_left' ? { textContent: '98' } : null,
    querySelector: selector => selector === 'a[href*="chat_log"]' ? { getAttribute: () => '/8620/10/24/2026#chat_log' } : null,
    querySelectorAll: selector => {
      if (selector === 'table') return [table];
      if (selector === '#word_list td.word') { wordReads++; return [{ textContent: ' alpha ' }, { textContent: 'bravo' }]; }
      return [];
    }
  };
  const context = vm.createContext({ document, window: { AddWord() {} } });
  // Prototype's $A accepts one argument; it ignores the modern mapping callback.
  vm.runInContext('Array.from = function(iterable) { return Array.prototype.slice.call(iterable); }', context);
  const pages = mk(fakeWc('https://playbabble.com/', { result: code => vm.runInContext(code, context) }), null);
  assert.equal((await pages.babble.state()).words, undefined); assert.equal(wordReads, 0);
  const value = await pages.babble.state(true);
  assert.deepEqual(Array.from(value.words), ['alpha', 'bravo']); assert.equal(value.gridLetters, letters);
  const { journalSnapshot } = require('../../src/progress-journal');
  const summary = journalSnapshot({ ...value, ready: true });
  assert.ok(summary, 'The real-page snapshot must be accepted before timing can start');
  assert.equal(summary.found, 2); assert.equal(summary.total, 100); assert.equal(summary.puzzleDate, '2026-10-24');
});
