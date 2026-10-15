'use strict';
/*
 * Resources menu. Edit this list to add or remove entries; "-" is a divider.
 *
 * Removed from the Delphi version because the sites are gone or moved:
 *   - AngelSong's BABBLE Resources and Guide  (freewebs.com)
 *   - Babble Anon Icon Themes                 (ezboard.com forum)
 *   - Babble Expert User Guide                (old Google Docs "Doc?id=" link)
 *   - 4 to 12 Letter Words (a2zwordfinder.com cgi-bin search; the site now lives at llexi.com)
 *   - Lickety Chat and the Fireworks page
 * Updated: OneLook's reverse dictionary now lives at onelook.com/thesaurus.
 */
module.exports = [
  { label: 'Icon Themes', url: 'https://playbabble.com/view_profile/6719', minWidth: 380 },
  '-',
  { label: 'A to Z Word Finder', url: 'https://llexi.com/afunzone/scrabble_words.html', minWidth: 420 },
  { label: 'One Look Reverse Dictionary', url: 'https://www.onelook.com/thesaurus/', minWidth: 420 },
  { label: 'More Words', url: 'https://www.morewords.com', minWidth: 420 },
  '-',
  { label: 'Lickety Info', url: 'https://r46.me/contactlickety', minWidth: 380 },
  { label: "lickety's Cheat Clues", url: 'https://r46.me/BabbleCheatClues.html', minWidth: 380, cheat: true },   // hidden unless started with code=MrPIsALittleCheater;GoHome
  '-',
  { label: 'Hide Resources', action: 'hide' }
];
