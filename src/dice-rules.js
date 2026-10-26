'use strict';
// Same reference Big Boggle 5x5 set used by Lickety Info's dice explanation.
// Source: https://web.stanford.edu/class/cs106x/res/handouts/15-Assignment-3-Boggle.pdf (p2).
// Babble's generator is not verified: this is a possible conflict, not a ban.
(function (root) {
  const dice = ['AAAFRS','AAEEEE','AAFIRS','ADENNN','AEEEEM','AEEGMU','AEGMNN','AFIRSY','BJKQXZ','CCNSTW',
    'CEIILT','CEILPT','CEIPST','DDLNOR','DDHNOT','DHHLOR','DHLNOR','EIIITT','EMOTTT','ENSSSU',
    'FIPRSY','GORRVW','HIPRRY','NOOTUW','OOOTTU'];
  const supply = Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => [letter,
    dice.flatMap((die, index) => die.includes(letter) ? [index] : [])]));
  function explain(raw) {
    const word = String(raw || '').toUpperCase();
    if (!/^[A-Z]{4,12}$/.test(word)) return '';
    if (/Q(?!U)/.test(word)) return 'Q needs its accompanying U on a Qu tile.';
    const tiles = [...word.replaceAll('QU', 'Q')];
    const rare = tiles.filter(letter => 'BJKQXZ'.includes(letter));
    if (rare.length > 1) return 'B, J, K, Qu, X and Z share one reference die; this word needs more than one of them.';
    const counts = {};
    for (const letter of tiles) {
      counts[letter] = (counts[letter] || 0) + 1;
      if (counts[letter] > supply[letter].length) return `Not enough ${letter} dice in the reference set.`;
    }
    // Bipartite matching has bounded polynomial work; avoid permutation search
    // for long words whose letters compete for the same dice.
    const candidates = tiles.map(letter => supply[letter]).sort((a, b) => a.length - b.length);
    const assigned = new Int8Array(dice.length).fill(-1);
    function assign(position, visited) {
      for (const die of candidates[position]) {
        if (visited[die]) continue;
        visited[die] = 1;
        if (assigned[die] < 0 || assign(assigned[die], visited)) { assigned[die] = position; return true; }
      }
      return false;
    }
    for (let i = 0; i < candidates.length; i++) if (!assign(i, new Uint8Array(dice.length)))
      return 'These letters compete for too few distinct dice in the reference set.';
    return '';
  }
  const api = { explain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BabbleDice = api;
})(typeof window !== 'undefined' ? window : globalThis);
