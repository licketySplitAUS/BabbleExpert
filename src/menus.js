'use strict';
/* Menu definitions as plain data (no Electron import), turned into native menus by app.js. */
const { FONT_SIZES } = require('./settings');

function resourcesTemplate({ resources, cheat, open, hide }) {
  const build = list => list
    .filter(r => r === '-' || !r.cheat || cheat)
    .map(r => {
      if (r === '-') return { type: 'separator' };
      if (r.action === 'hide') return { label: r.label, click: hide };
      if (r.heading) return { label: r.label, enabled: false };
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

function optionsTemplate(d, patch, { open = () => {}, experiments = {}, track = () => {}, checkUpdates = null } = {}) {
  const a = d.add;
  return [
    { label: 'Check for updates', enabled: typeof checkUpdates === 'function', click: () => checkUpdates?.() },
    { type: 'separator' },
    { label: 'Yellow Theme', type: 'checkbox', checked: d.yellow, click: m => { patch({ yellow: m.checked }); track(`Yellow Theme ${m.checked ? 'on' : 'off'}`); } },
    { label: 'Switch Sides (Clues and Babble)', type: 'checkbox', checked: d.switchSides, click: m => { patch({ switchSides: m.checked }); track(`Switch Sides ${m.checked ? 'on' : 'off'}`); } },
    {
      label: 'Lickety Add',
      submenu: [
        { label: 'No Chat', type: 'checkbox', checked: a.noChat, click: m => { patch({ add: { noChat: m.checked } }); track(`No Chat ${m.checked ? 'on' : 'off'}`); } },
        { label: 'Add Word Speed', submenu: [['Slow', 5], ['Medium', 3], ['Fast', 0]].map(([label, v]) => ({ label, type: 'radio', checked: a.speed === v, click: () => { patch({ add: { speed: v } }); track(`Add Word Speed ${label}`); } })) },
        { label: 'Font Size', submenu: FONT_SIZES.map(f => ({ label: f, type: 'radio', checked: a.fontSize === f, click: () => { patch({ add: { fontSize: f } }); track(`Font Size ${f}`); } })) },
        { label: 'Thin Box', type: 'checkbox', checked: a.thin, click: m => { patch({ add: { thin: m.checked } }); track(`Thin Box ${m.checked ? 'on' : 'off'}`); } }
      ]
    },
    { label: 'Hide Balloon Hints', type: 'checkbox', checked: d.hideHints, click: m => { patch({ hideHints: m.checked }); track(`Hide Balloon Hints ${m.checked ? 'on' : 'off'}`); } },
    { label: 'Highlight entry on grid', type: 'checkbox', checked: d.highlightEntry !== false, click: m => { patch({ highlightEntry: m.checked }); track(`Highlight entry on grid ${m.checked ? 'on' : 'off'}`); } },
    { type: 'separator' },
    { label: 'Fun Word Play', enabled: !!experiments.funWordPlay, click: () => experiments.funWordPlay && open(experiments.funWordPlay) },
    { label: 'Chill Vibes', enabled: !!experiments.chillVibes, click: () => experiments.chillVibes && open(experiments.chillVibes) },
    { type: 'separator' },
    { label: 'Share anonymous usage notifications', type: 'checkbox', checked: d.usageSharing === true, click: m => { patch({ usageSharing: m.checked }); if (m.checked) track('Anonymous usage notifications enabled'); } }
  ];
}

module.exports = { resourcesTemplate, cluesTemplate, optionsTemplate };
