'use strict';
/*
 * Talks to the two web pages. This replaces the Delphi CallJavascript(): it runs a small piece of
 * JavaScript inside the page and returns the result. Nothing is ever run unless the page is on an
 * expected website, so if someone browses away the app stops scripting it.
 */

const J = JSON.stringify;
const str = '(r==null||typeof r==="object")?"":String(r)';

const CLUES_FUNCTIONS = ['GetAllWords', 'AddBabbleWord', 'showAll'];

function makePages({ getBabble, getClues, babbleHosts, cluesHosts }) {
  async function run(getWc, hosts, code) {
    const wc = getWc();
    if (!wc || wc.isDestroyed()) throw new Error('page not available');
    let host = '';
    try { host = new URL(wc.getURL()).hostname; } catch { /* about:blank etc. */ }
    if (!hosts.includes(host)) throw new Error('not on the expected website');
    if (wc.isLoading()) throw new Error('page still loading');
    return wc.executeJavaScript(code, false);
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
      // puzzle id uses the same rule as the Delphi code: 4 characters before "chat_log"
      state: () => onBabble(`(function(){
        var left = document.getElementById('total_words_left');
        var html = document.documentElement.outerHTML, i = html.indexOf('chat_log');
        var id = i >= 5 ? html.substring(i - 5, i - 1) : (document.getElementById('word_list') ? 'puzzle' : '');
        return { puzzleId: id, remaining: left ? left.textContent.trim() : null, hasAddWord: typeof window.AddWord === 'function' };
      })()`),
      words: () => onBabble(`Array.prototype.map.call(document.querySelectorAll('#word_list td.word'),
        function(td){ return td.textContent.trim(); }).filter(Boolean)`),
      addWord: word => onBabble(`(async function(){
        if (typeof window.AddWord !== 'function') throw new Error('AddWord() not found on the Babble page');
        var r = await window.AddWord(${J(String(word))});
        return ${str};
      })()`),
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
      ping: () => onClues(`(function(){
        if (typeof window.GetAllWords !== 'function' || typeof window.AddBabbleWord !== 'function') throw new Error('clues page not ready');
        return true;
      })()`),
      getAllWords: async () => String((await callClues('GetAllWords')) || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      addBabbleWord: word => callClues('AddBabbleWord', word),
      showAll: () => callClues('showAll')
    }
  };
}

module.exports = { makePages, CLUES_FUNCTIONS };
