'use strict';

function readClueEntry(document, identity, foundWords) {
  const fields = Array.from(document.querySelectorAll('input.answer, input[name^="edt"]'));
  const field = fields.find(input => identity.name ? input.name === identity.name : input.getAttribute('data-answer-word') === identity.answerKey);
  const row = field && field.closest('tr');
  const label = row && row.cells[0] && row.cells[0].textContent.trim().match(/^([a-z]{2})(\d+),\s*\d+/i);
  if (!label || row.querySelector('input[type="checkbox"]')?.checked) return null;
  const prefix = label[1].toLowerCase(), length = Number(label[2]);
  if (length < 4 || length > 12) return null;
  let lower = '', upper = '';
  const found = new Set(foundWords.map(word => String(word).trim().toLowerCase()).filter(word => /^[a-z]{4,}$/.test(word)));
  const orderKey = (field.getAttribute('data-answer-word') || '').toLowerCase();
  if (orderKey) {
    // Self Serve removes found rows in Off view. Use the row's ordering key
    // only to locate its solved neighbours; never return it as a candidate.
    for (const word of found) {
      if (word < orderKey && (!lower || word > lower)) lower = word;
      if (word > orderKey && (!upper || word < upper)) upper = word;
    }
  } else {
    const index = fields.indexOf(field);
    const solved = input => {
      const checked = input.closest('tr')?.querySelector('input[type="checkbox"]')?.checked;
      const word = String(input.value || '').trim().toLowerCase();
      return checked && found.has(word) ? word : '';
    };
    for (let i = index - 1; i >= 0 && !lower; i--) lower = solved(fields[i]);
    for (let i = index + 1; i < fields.length && !upper; i++) upper = solved(fields[i]);
  }
  return { prefix, length, lower, upper };
}

function markClueEntry(document, identity, scroll = false) {
  const fields = Array.from(document.querySelectorAll('input.answer, input[name^="edt"]'));
  const field = fields.find(input => identity.name ? input.name === identity.name : input.getAttribute('data-answer-word') === identity.answerKey);
  const row = field?.closest('tr');
  if (!row) return;
  for (const previous of document.querySelectorAll('[data-babble-expert-active-clue]')) previous.removeAttribute('data-babble-expert-active-clue');
  row.setAttribute('data-babble-expert-active-clue', '');
  if (scroll) row.scrollIntoView({ block: 'center', behavior: 'instant' });
}

function nextClueEntry(document, identity = null, direction = 1) {
  const fields = Array.from(document.querySelectorAll('input.answer, input[name^="edt"]'));
  const current = fields.findIndex(field => identity && (identity.name ? field.name === identity.name : field.getAttribute('data-answer-word') === identity.answerKey));
  const eligible = fields.map((field, index) => {
    const row = field.closest('tr');
    const label = row?.cells[0]?.textContent.trim().match(/^([a-z]{2})(\d+),\s*\d+/i);
    const name = /^edt\d+$/.test(field.name || '') ? field.name : '';
    const answerKey = field.getAttribute('data-answer-word') || '';
    if (!label || Number(label[2]) < 4 || Number(label[2]) > 12 || (!name && !/^[a-z]{4,25}$/i.test(answerKey)) ||
        field.disabled || field.type === 'hidden' || row.querySelector('input[type="checkbox"]')?.checked ||
        (field.getClientRects && !field.getClientRects().length)) return null;
    return { identity: { name, answerKey }, index };
  }).filter(Boolean);
  if (!eligible.length) return null;
  const backwards = direction === -1;
  const ordered = backwards ? eligible.slice().reverse() : eligible;
  let next;
  if (current >= 0) next = ordered.find(entry => backwards ? entry.index < current : entry.index > current);
  else if (identity?.answerKey) {
    // Off view removes completed rows: continue from the removed ordering key.
    next = ordered.find(entry => backwards ? entry.identity.answerKey.toLowerCase() < identity.answerKey.toLowerCase()
      : entry.identity.answerKey.toLowerCase() > identity.answerKey.toLowerCase());
  } else next = ordered[0];
  return { identity: (next || ordered[0]).identity, wrapped: !next };
}

function completedClueEntry(document, identity, foundWords) {
  const radios = document.querySelectorAll('input[name="view"], input[name="rdbShow"]');
  if (!identity || !radios[2]?.checked) return false;
  if (identity.answerKey) {
    // React removes completed rows in Off mode. The saved ordering key still
    // identifies that exact clue; another found word must not move selection.
    return foundWords.some(word => String(word).trim().toLowerCase() === identity.answerKey.toLowerCase());
  }
  const field = Array.from(document.querySelectorAll('input.answer, input[name^="edt"]')).find(input => input.name === identity.name);
  return !!field?.closest('tr')?.querySelector('input[type="checkbox"]')?.checked;
}

module.exports = { readClueEntry, markClueEntry, nextClueEntry, completedClueEntry };
