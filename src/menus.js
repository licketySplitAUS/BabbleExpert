'use strict';
/* Menu definitions as plain data (no Electron import), turned into native menus by app.js. */
const { FONT_SIZES } = require('./settings');

function resourcesTemplate({ resources, cheat, open, hide }) {
  const build = list => list
    .filter(r => r === '-' || !r.cheat || cheat)
    .map(r => {
      if (r === '-') return { type: 'separator' };
      if (r.action === 'hide') return { label: r.label, click: hide };
      if (r.submenu) return { label: r.label, submenu: build(r.submenu) };
      return { label: r.label, click: () => open(r) };
    });
  return build(resources);
}

function cluesTemplate(source, select) {
  return [
    { label: "Lickety's Clues", type: 'radio', checked: source === 'lickety', click: () => select('lickety') },
    { label: 'Self Serve Clues', type: 'radio', checked: source === 'selfServe', click: () => select('selfServe') }
  ];
}

function optionsTemplate(d, patch) {
  const a = d.add;
  return [
    { label: 'Yellow Theme', type: 'checkbox', checked: d.yellow, click: m => patch({ yellow: m.checked }) },
    { label: 'Switch Sides (Clues and Babble)', type: 'checkbox', checked: d.switchSides, click: m => patch({ switchSides: m.checked }) },
    {
      label: 'Lickety Add',
      submenu: [
        { label: 'No Chat', type: 'checkbox', checked: a.noChat, click: m => patch({ add: { noChat: m.checked } }) },
        { label: 'Add Word Speed', submenu: [['Slow', 5], ['Medium', 3], ['Fast', 0]].map(([label, v]) => ({ label, type: 'radio', checked: a.speed === v, click: () => patch({ add: { speed: v } }) })) },
        { label: 'Font Size', submenu: FONT_SIZES.map(f => ({ label: f, type: 'radio', checked: a.fontSize === f, click: () => patch({ add: { fontSize: f } }) })) },
        { label: 'Thin Box', type: 'checkbox', checked: a.thin, click: m => patch({ add: { thin: m.checked } }) }
      ]
    },
    { label: 'Hide Balloon Hints', type: 'checkbox', checked: d.hideHints, click: m => patch({ hideHints: m.checked }) }
  ];
}

module.exports = { resourcesTemplate, cluesTemplate, optionsTemplate };
