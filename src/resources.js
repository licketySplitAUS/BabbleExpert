'use strict';
/*
 * Resources menu. Edit this list to add or remove entries; "-" is a divider.
 *
 * Removed from the Delphi version because the sites are gone or moved:
 *   - AngelSong's BABBLE Resources and Guide  (freewebs.com)
 *   - Babble Anon Icon Themes                 (ezboard.com forum)
 *   - Babble Expert User Guide                (old Google Docs "Doc?id=" link)
 *   - 4 to 12 Letter Words (the old a2zwordfinder.com search)
 *   - Lickety Chat and the Fireworks page
 * Updated: OneLook's reverse dictionary now lives at onelook.com/thesaurus.
 */
module.exports = [
  { label: 'All Lickety Words', heading: true },
  ...Array.from({ length: 9 }, (_, i) => {
    const length = i + 4;
    return {
      label: `\u2003\u2003${length} Letter Words`,
      title: `${length} Letter Words`,
      url: `https://licketysplitaus.github.io/Babble/words-${length}.html?v=5`,
      width: 90 + (length - 4) * 8,
      external: false,
      showTitle: false,
      submitWords: true
    };
  }),
  { label: 'One Look Reverse Dictionary', url: 'https://www.onelook.com/thesaurus/', minWidth: 420 },
  { label: 'More Words', url: 'https://www.morewords.com', minWidth: 420 },
  '-',
  { label: 'Lickety Info', url: 'https://licketysplitaus.github.io/Babble/lickety-info.html', local: 'experiments/lickety-info.html', minWidth: 420 },
  { label: "lickety's Cheat Clues", url: 'https://r46.me/BabbleCheatClues.html', minWidth: 380, cheat: true },   // hidden unless started with code=MrPIsALittleCheater;GoHome
  '-',
  { label: 'Hide Resources', action: 'hide' }
];
