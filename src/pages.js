'use strict';
/*
 * Talks to the two web pages. This replaces the Delphi CallJavascript(): it runs a small piece of
 * JavaScript inside the page and returns the result. Nothing is ever run unless the page is on an
 * expected website, so if someone browses away the app stops scripting it.
 */

const J = JSON.stringify;
const { findBabbleWordEntry } = require('./babble-entry');
const { readClueEntry } = require('./clue-entry');
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
      state: () => onBabble(`(function(){
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
          hasAddWord: typeof window.AddWord === 'function', loginRequired: !left && !!document.querySelector('input[type="password"]') };
      })()`),
      words: () => onBabble(`Array.prototype.map.call(document.querySelectorAll('#word_list td.word'),
        function(td){ return td.textContent.trim(); }).filter(Boolean)`),
      setWordEntry: word => onBabble(wordEntryScript(word)),
      addWord: (word, valid = () => true) => queueWord(() => {
        if (!valid()) throw new Error('Puzzle changed before sending.');
        return onBabble(`(async function(){
        if (typeof window.AddWord !== 'function') throw new Error('AddWord() not found on the Babble page');
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
              resolve(message ? message.textContent.trim() : '');
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
      entryContext: identity => onClues(`(function(){
        if (typeof window.GetAllWords !== 'function') return null;
        return (${readClueEntry.toString()})(document, ${J(identity)}, String(window.GetAllWords() || '').split(String.fromCharCode(10)));
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
        if (document.querySelector('button.grabgrid')) return '';
        if (typeof window.showAll !== 'function') throw new Error('showAll() not found on the Clues page');
        var r = window.showAll();
        return ${str};
      })()`)
    }
  };
}

module.exports = { makePages, CLUES_FUNCTIONS, readGridLetters };
