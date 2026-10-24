'use strict';

// Keep a sparse, session-only cache. Changing a list does not change the puzzle.
function createWordListResults() {
  let key = '';
  const byLength = new Map();
  const record = ({ word, color, message }) => {
    word = String(word || '').toLowerCase();
    if (!key || !/^[a-z]{4,12}$/.test(word) || !['red', 'green', 'amber'].includes(color)) return null;
    let results = byLength.get(word.length);
    if (!results) byLength.set(word.length, results = new Map());
    const previous = results.get(word);
    if (previous?.color === color && previous.message === message) return null;
    const result = { word, color, message };
    results.set(word, result);
    return result;
  };
  return {
    get key() { return key; },
    setPuzzle({ ready, puzzleId, gridLetters }) {
      if (!ready || !puzzleId || !/^[A-Z]{25}$/.test(gridLetters)) return false;
      const next = puzzleId + ':' + gridLetters;
      if (next === key) return false;
      key = next; byLength.clear();
      return true;
    },
    record,
    found(words) {
      const changed = [];
      for (const raw of words) {
        const word = String(raw).toLowerCase();
        // Keep the green result of a word newly accepted in this session.
        if (byLength.get(word.length)?.get(word)?.color === 'green') continue;
        const result = record({ word, color: 'amber', message: 'Already entered in Babble: ' + word });
        if (result) changed.push(result);
      }
      return changed;
    },
    forLength(length) { return [...(byLength.get(length)?.values() || [])]; }
  };
}

module.exports = { createWordListResults };
