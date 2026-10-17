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

module.exports = { readClueEntry };
