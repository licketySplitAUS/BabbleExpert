'use strict';
/*
 * Talks to the two web pages. This replaces the Delphi CallJavascript(): it runs a small piece of
 * JavaScript inside the page and returns the result. Nothing is ever run unless the page is on an
 * expected website, so if someone browses away the app stops scripting it.
 */

const J = JSON.stringify;
const { findBabbleWordEntry } = require('./babble-entry');
const { readClueEntry, markClueEntry, nextClueEntry, completedClueEntry } = require('./clue-entry');
const { allowedPage, executeBounded } = require('./page-runtime');
const str = '(r==null||typeof r==="object")?"":String(r)';
const wordEntryScript = word => `(function(){
  var word = ${J(String(word || ''))}, glow = window.__babbleExpertGlow;
  if (glow && glow.setEntryWord) return glow.setEntryWord(word);
  var entry = (${findBabbleWordEntry.toString()})(document);
  if (!entry) return false;
  entry.value = word;
  entry.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

const CLUES_FUNCTIONS = ['GetAllWords', 'AddBabbleWord', 'showAll'];

// The HTML can finish loading before Babble's asynchronous saved-word request.
// An empty list during that interval must never be treated as a new game.
function babbleWordListReady(document, window) {
  const loading = document.getElementById?.('word_list_loading');
  if (loading?.style && !loading.hidden && loading.style.display !== 'none') return false;
  return typeof window.GetWordList !== 'function' || !!String(window.puzzle_id || '').trim();
}
const wordsReadyScript = '(' + babbleWordListReady.toString() + ')(document, window)';

// Remember the total only from a fully loaded list, before a failed submission
// callback can leave its rows and counters out of step. It lasts one document.
function rememberBabbleWordTotal(document, window) {
  const id = String(window.puzzle_id || '');
  if (!id || !babbleWordListReady(document, window)) return;
  if (window.__babbleExpertWordTotal?.puzzleId === id) return;
  const left = document.getElementById('total_words_left')?.textContent.trim();
  if (!/^\d+$/.test(left || '')) return;
  const words = new Set(Array.prototype.map.call(document.querySelectorAll('#word_list td.word'), td => td.textContent.trim().toLowerCase()).filter(Boolean));
  window.__babbleExpertWordTotal = { puzzleId: id, total: Number(left) + words.size };
}
const rememberTotalScript = `(function(){ const babbleWordListReady = ${babbleWordListReady.toString()}; (${rememberBabbleWordTotal.toString()})(document, window); })()`;

// Read tiles in board order. Q/Qu is one tile; decorative images are excluded.
function readGridLetters(document) {
  const letter = img => {
    const match = img && (img.getAttribute('src') || '').match(/(?:^|\/)([a-z]|qu)\.gif(?:[?#].*)?$/i);
    return match ? match[1].toUpperCase().replace('QU', 'Q') : '';
  };
  const selfServe = Array.from(document.querySelectorAll('.board button img')).map(letter);
  if (selfServe.length === 25 && selfServe.every(Boolean)) return selfServe.join('');
  for (const table of document.querySelectorAll('table')) {
    const rows = Array.from(table.rows || []);
    if (rows.length !== 5 || rows.some(row => row.cells.length !== 5)) continue;
    const tiles = rows.flatMap(row => Array.from(row.cells)).map(cell => letter(cell.querySelector('img')));
    if (tiles.every(Boolean)) return tiles.join('');
  }
  const legacy = Array.from(document.querySelectorAll('img[onclick]'))
    .filter(img => /addLetter\s*\(/i.test(img.getAttribute('onclick') || '')).map(letter);
  return legacy.length === 25 && legacy.every(Boolean) ? legacy.join('') : '';
}
const gridScript = '(' + readGridLetters.toString() + ')(document)';

function makePages({ getBabble, getClues, babbleHosts, cluesHosts, allowLocal = false, timeoutMs = 12000 }) {
  let wordQueue = Promise.resolve();
  const queueWord = task => {
    const result = wordQueue.then(task);
    wordQueue = result.catch(() => {});
    return result;
  };
  async function run(getWc, hosts, code) {
    const wc = getWc();
    if (!wc || wc.isDestroyed()) throw new Error('page not available');
    if (!allowedPage(wc.getURL(), hosts, allowLocal)) throw new Error('not on the expected website');
    if (wc.isLoading()) throw new Error('page still loading');
    return executeBounded(wc, code, { timeoutMs });
  }
  const onBabble = code => run(getBabble, babbleHosts, code);
  const onClues = code => run(getClues, cluesHosts, code);

  const callClues = (fn, arg) => {
    if (!CLUES_FUNCTIONS.includes(fn)) throw new Error('function not allowed: ' + fn);
    return onClues(`(async function(){
      if (typeof window[${J(fn)}] !== 'function') throw new Error(${J(fn)} + '() not found on the Clues page');
      var r = await window[${J(fn)}](${arg === undefined ? '' : J(String(arg))});
      return ${str};
    })()`);
  };

  return {
    babble: {
      fireworks: script => onBabble(String(script)),
      installGlow: script => onBabble(String(script)),
      previewGlow: word => onBabble(`(function(){ var g=window.__babbleExpertGlow; if(g) g.update(${J(String(word || ''))}); return !!g; })()`),
      finishGlow: (word, color) => onBabble(`(function(){ var g=window.__babbleExpertGlow; if(g) g.finish(${J(String(word || ''))},${J(String(color || ''))}); return !!g; })()`),
      currentGlowWord: () => onBabble(`(function(){ var g=window.__babbleExpertGlow; return g && g.getWord ? g.getWord() : ''; })()`),
      setGlowEnabled: enabled => onBabble(`(function(){ var g=window.__babbleExpertGlow; if(g && g.setEnabled) g.setEnabled(${enabled !== false}); return !!g; })()`),
      setGlowRemaining: words => onBabble(`(function(){ var g=window.__babbleExpertGlow; if(g) g.setRemaining(${J(Array.isArray(words) ? words : [])}); return !!g; })()`),
      // Prefer Babble's ID and dated chat link; retain the legacy fallback for compatible pages.
      // Use map.call for words: Babble's Prototype replaces Array.from with $A,
      // which ignores the modern mapping callback and returns DOM nodes instead.
      state: (includeWords = false) => onBabble(`(function(){
        ${rememberTotalScript};
        var left = document.getElementById('total_words_left');
        var id = window.puzzle_id != null ? String(window.puzzle_id) : (document.getElementById('word_list') ? 'puzzle' : '');
        var link = document.querySelector('a[href*="chat_log"]'), match = link && link.getAttribute('href').match(/\\/(\\d+)\\/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
        if (match) id = match[1];
        else if (window.puzzle_id == null) {
          var legacy = link && link.getAttribute('href').match(/(?:^|\\/)(\\d+)\\/chat_log/);
          if (legacy) id = legacy[1];
          else { var html = document.documentElement.outerHTML, i = html.indexOf('chat_log'); if (i >= 5) id = html.substring(i - 5, i - 1); }
        }
        return { puzzleId: id, gridLetters: ${gridScript}, puzzleDate: match ? match[4] + '-' + match[2] + '-' + match[3] : '', remaining: left ? left.textContent.trim() : null,
          hasAddWord: typeof window.AddWord === 'function', wordListReady: ${wordsReadyScript}, loginRequired: !left && !!document.querySelector('input[type="password"], a[href="/log_in"]')
          ${includeWords ? ", words: Array.prototype.map.call(document.querySelectorAll('#word_list td.word'), function(td){ return td.textContent.trim(); })" : ''} };
      })()`),
      words: () => onBabble(`(function(){
        if (!${wordsReadyScript}) throw new Error('Babble word list still loading');
        return Array.prototype.map.call(document.querySelectorAll('#word_list td.word'),
          function(td){ return td.textContent.trim(); }).filter(Boolean);
      })()`),
      // Repair a stale display from server-confirmed words, without reloading
      // the page, losing drafts, or resubmitting an uncertain word.
      refreshWords: identity => onBabble(`(async function(){
        var expected = ${J(identity)}, grid = function(){ return ${gridScript}; };
        if (!expected || !/^[A-Z]{25}$/.test(expected.gridLetters)) return false;
        var samePuzzle = function(){ return String(window.puzzle_id) === expected.puzzleId && grid() === expected.gridLetters; };
        if (!samePuzzle() || !${wordsReadyScript} || !document.getElementById('total_words_left') ||
            typeof window.AddToWordList !== 'function' || typeof window.UpdateWordListTotals !== 'function') return false;
        var controller = new AbortController(), timer = setTimeout(function(){ controller.abort(); }, 4000);
        try {
          var response = await fetch('/action/get_word_list?puzzleid=' + encodeURIComponent(expected.puzzleId),
            { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
          if (!response.ok) return false;
          var data = await response.json();
          if (!samePuzzle() || !${wordsReadyScript} || !data || !Array.isArray(data.words)) return false;
          var existing = new Set(Array.prototype.map.call(document.querySelectorAll('#word_list td.word'),
            function(td){ return td.textContent.trim().toLowerCase(); }));
          for (var i = 0; i < data.words.length; i++) {
            var row = data.words[i];
            if (!Array.isArray(row) || typeof row[0] !== 'string' || !/^[a-z]{4,}$/i.test(row[0]) ||
                !Number.isFinite(Number(row[1])) || !Number.isFinite(Number(row[2]))) return false;
          }
          for (var i = 0; i < data.words.length; i++) {
            var row = data.words[i], word = row[0].toLowerCase();
            if (existing.has(word)) continue;
            window.AddToWordList(word, Number(row[1]), Number(row[2]));
            existing.add(word);
          }
          window.UpdateWordListTotals();
          var total = window.__babbleExpertWordTotal;
          if (total && total.puzzleId === expected.puzzleId && Number.isInteger(total.total) && total.total >= existing.size) {
            document.getElementById('total_words_left').textContent = String(total.total - existing.size);
          }
          return true;
        } finally { clearTimeout(timer); }
      })()`),
      setWordEntry: word => onBabble(`(function(){ if (!${wordsReadyScript}) return false; return ${wordEntryScript(word)}; })()`),
      addWord: (word, valid = () => true) => queueWord(() => {
        if (!valid()) throw new Error('Puzzle changed before sending.');
        return onBabble(`(async function(){
        if (typeof window.AddWord !== 'function') throw new Error('AddWord() not found on the Babble page');
        if (!${wordsReadyScript}) throw new Error('Babble word list still loading');
        ${rememberTotalScript};
        ${wordEntryScript(word)};
        var original = window.AddWordPostOp, wrapper, timer;
        var completed = new Promise(function(resolve){
          if (typeof original !== 'function') { resolve(''); return; }
          wrapper = function(){
            var response;
            try { response = JSON.parse(arguments[0].responseText); } catch { /* compatible page without JSON */ }
            if (response && response.word && String(response.word).toLowerCase() !== ${J(String(word).toLowerCase())}) {
              return original.apply(this, arguments);
            }
            try { return original.apply(this, arguments); }
            finally {
              if (window.AddWordPostOp === wrapper) window.AddWordPostOp = original;
              clearTimeout(timer);
              var message = document.getElementById('sub_puzzle_message');
              // Prefer the matching server acknowledgement over a stale page
              // message when Babble's own display callback failed partway through.
              var reply = message ? message.textContent.trim() : '';
              if (response && String(response.word || '').toLowerCase() === ${J(String(word).toLowerCase())}) {
                if (response.error === 'duplicate') reply = 'Already entered: ' + response.word;
                else if (!response.error && response.letters != null && response.points != null) reply = 'Last word added: ' + response.word;
                else if (response.error === 'not_logged_in') reply = 'Babble login required';
              }
              resolve(reply);
            }
          };
          window.AddWordPostOp = wrapper;
          timer = setTimeout(function(){
            if (window.AddWordPostOp === wrapper) window.AddWordPostOp = original;
            resolve('');
          }, 5000);
        });
        var r;
        try { r = await window.AddWord(${J(String(word))}); }
        catch (e) {
          if (wrapper && window.AddWordPostOp === wrapper) window.AddWordPostOp = original;
          clearTimeout(timer);
          throw e;
        }
        var immediate = ${str};
        if (immediate) {
          if (wrapper && window.AddWordPostOp === wrapper) window.AddWordPostOp = original;
          clearTimeout(timer);
        }
        return immediate || await completed;
      })()`);
      }),
      addChat: text => onBabble(`(async function(){
        var form = document.post_message || document.forms['post_message'] || document.querySelector('form[name="post_message"]');
        var field = form && (form.add_message || (form.elements && form.elements['add_message']) || form.querySelector('[name="add_message"]'));
        if (!field || typeof window.AddChatMessage !== 'function') throw new Error('chat form not found on the Babble page');
        field.value = ${J(String(text))};
        await window.AddChatMessage();
        return '';
      })()`)
    },
    clues: {
      completedEntry: identity => onClues(`(function(){
        if (typeof window.GetAllWords !== 'function') return false;
        return (${completedClueEntry.toString()})(document, ${J(identity)}, String(window.GetAllWords() || '').split(String.fromCharCode(10)));
      })()`),
      entryContext: identity => onClues(`(function(){
        if (typeof window.GetAllWords !== 'function') return null;
        var context = (${readClueEntry.toString()})(document, ${J(identity)}, String(window.GetAllWords() || '').split(String.fromCharCode(10)));
        if (context) (${markClueEntry.toString()})(document, ${J(identity)});
        return context;
      })()`),
      nextEntry: (identity, direction = 1) => onClues(`(function(){
        if (typeof window.GetAllWords !== 'function') return null;
        var next = (${nextClueEntry.toString()})(document, ${J(identity)}, ${J(direction)});
        if (!next) return null;
        var context = (${readClueEntry.toString()})(document, next.identity, String(window.GetAllWords() || '').split(String.fromCharCode(10)));
        if (!context) return null;
        (${markClueEntry.toString()})(document, next.identity, true);
        return { ...next, context };
      })()`),
      state: () => onClues(`(function(){
        var heading = document.querySelector('h2'), text = heading ? heading.textContent : '';
        var grid = ${gridScript};
        var ready = typeof window.GetAllWords === 'function' && typeof window.AddBabbleWord === 'function';
        // A filtered or completed clue list may have no visible answer inputs.
        // Its total count, rather than the current view, tells us it has loaded.
        if (document.querySelector('button.grabgrid')) {
          var totals = document.querySelector('.totals');
          var count = totals && totals.textContent.match(/Total\\s*:\\s*(\\d+)/i);
          ready = ready && grid.length === 25 && !!count && Number(count[1]) > 0;
        }
        return { gridLetters: grid, ready: ready, heading: text.trim() };
      })()`),
      ensurePuzzle: gridLetters => onClues(`(function(){
        var button = document.querySelector('button.grabgrid');
        if (!button) return 'unsupported';
        var grid = ${gridScript}, expected = ${J(String(gridLetters))};
        if (grid.length !== 25 || expected.length !== 25) return 'waiting';
        if (grid === expected) return 'current';
        button.click();
        return 'requested';
      })()`),
      reloadSnapshot: () => onClues(`(function(){
        var grid = ${gridScript};
        if (!document.myForm || grid.length !== 25 || typeof window.GetAllWords !== 'function') return null;
        return { gridLetters: grid, words: String(window.GetAllWords() || '').split(/\\r?\\n/).filter(Boolean) };
      })()`),
      restoreReloadSnapshot: snapshot => onClues(`(function(){
        var saved = ${J(snapshot)};
        if (!saved || !saved.gridLetters || ${gridScript} !== saved.gridLetters) return false;
        if (typeof window.AddBabbleWord !== 'function' || typeof window.showAll !== 'function') throw new Error('Clues page not ready');
        saved.words.forEach(function(word){ window.AddBabbleWord(word); });
        window.showAll();
        return true;
      })()`),
      fireworks: script => onClues(String(script)),
      ping: () => onClues(`(function(){
        if (typeof window.GetAllWords !== 'function' || typeof window.AddBabbleWord !== 'function') throw new Error('clues page not ready');
        return true;
      })()`),
      activeWordEntry: () => onClues(`(function(){
        var el = document.activeElement;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return null;
        var isEntry = el.id === 'add-word' || el.name === 'addWord' || /^edt\\d+$/.test(el.name || '') || el.classList.contains('answer');
        if (!isEntry) return null;
        return String(el.value || '').toLowerCase().replace(/[^a-z]/g, '');
      })()`),
      hasWord: word => onClues(`(function(){
        var wanted = ${J(String(word || '').toLowerCase())};
        if (document.querySelector('[data-answer-word="' + CSS.escape(wanted.toUpperCase()) + '"]')) return true;
        if (Array.isArray(window.lWordArray) && typeof window.decrypt === 'function') {
          return window.lWordArray.some(function(value){ return String(window.decrypt(value) || '').toLowerCase() === wanted; });
        }
        return false;
      })()`),
      getAllWords: async () => String((await callClues('GetAllWords')) || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      remainingWords: () => onClues(`(function(){
        var result = [], seen = Object.create(null);
        Array.prototype.forEach.call(document.querySelectorAll('[data-answer-word]'), function(input){
          var row = input.closest('tr'), check = row && row.querySelector('input[type="checkbox"]');
          var word = String(input.getAttribute('data-answer-word') || '').toLowerCase();
          if (word && !(row && row.classList.contains('done')) && !(check && check.checked) && !seen[word]) { seen[word] = true; result.push(word); }
        });
        if (result.length) return result;
        if (Array.isArray(window.lWordArray) && typeof window.decrypt === 'function' && document.myForm) {
          for (var i = 0; i < window.lWordArray.length; i++) {
            var check = document.myForm['check' + (i + 1)];
            var word = String(window.decrypt(window.lWordArray[i]) || '').toLowerCase();
            if (word && !(check && check.checked) && !seen[word]) { seen[word] = true; result.push(word); }
          }
        }
        return result;
      })()`),
      addBabbleWord: word => callClues('AddBabbleWord', word),
      // Legacy Clues needs an explicit counter refresh. Self Serve refreshes
      // reactively; its showAll() changes the selected filter instead.
      showAll: () => onClues(`(function(){
        if (document.querySelector('button.grabgrid, .showline input[name="view"]')) return '';
        if (typeof window.showAll !== 'function') throw new Error('showAll() not found on the Clues page');
        var r = window.showAll();
        return ${str};
      })()`)
    }
  };
}

module.exports = { makePages, CLUES_FUNCTIONS, readGridLetters, babbleWordListReady, rememberBabbleWordTotal };
