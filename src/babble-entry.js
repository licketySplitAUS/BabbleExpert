'use strict';

function findBabbleWordEntry(document) {
  if (typeof document.querySelectorAll !== 'function') return null;
  let best = null, bestScore = 0;
  for (const field of document.querySelectorAll('input, textarea')) {
    if (/^(password|email|hidden|checkbox|radio|submit|button|search)$/i.test(field.type || '')) continue;
    // Babble's Email field is type=text. Never infer a word input from
    // authentication labels (in particular, the "word" in "Password").
    if (/^(email|username|user_name|login|password|passwd|pwd)$/i.test(field.name || '') ||
        /^(email|username|user_name|login|password|passwd|pwd)$/i.test(field.id || '') ||
        /(?:^|\s)(?:username|current-password|new-password|one-time-code)(?:\s|$)/i.test(field.getAttribute('autocomplete') || '')) continue;
    if (field.name === 'add_message' || field.id === 'add_message' || field.closest('form[name="post_message"]')) continue;
    const name = `${field.name || ''} ${field.id || ''}`;
    const hint = `${field.placeholder || ''} ${field.getAttribute('aria-label') || ''}`;
    const form = field.form;
    if (form && (form.querySelector?.('input[type="password"], input[autocomplete="current-password"], input[autocomplete="new-password"]') ||
        /(?:log[_-]?in|sign[_-]?in|sign[_-]?up|password)/i.test(`${form.name || ''} ${form.getAttribute('action') || ''}`))) continue;
    const formHint = form ? `${form.name || ''} ${form.getAttribute('onsubmit') || ''}` : '';
    const score = /(?:^|\s)(?:add_?word|word)(?:\s|$)/i.test(name) ? 3 : /word/i.test(name + ' ' + hint) ? 2 : /word/i.test(formHint) ? 1 : 0;
    if (score > bestScore) { best = field; bestScore = score; }
  }
  return best;
}

module.exports = { findBabbleWordEntry };
