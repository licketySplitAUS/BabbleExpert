'use strict';
const { ipcRenderer } = require('electron');
let enabled = false;
ipcRenderer.on('create-clues:enabled', (_event, value) => { enabled = value === true; });
ipcRenderer.invoke('create-clues:enabled').then(value => { enabled = value === true; }).catch(() => {});
document.addEventListener('click', event => {
  if (!enabled || event.button !== 0) return;
  const row = event.target.closest && event.target.closest('#word_list tr');
  const field = row && row.querySelector('td.word');
  const word = field && field.textContent.trim().toLowerCase();
  if (!word || !/^[a-z]{4,25}$/.test(word)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ipcRenderer.send('create-clues:word', { word, x: event.clientX, y: event.clientY });
}, true);
