'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('clue', {
  get: () => ipcRenderer.invoke('create-clues:get'),
  retry: () => ipcRenderer.invoke('create-clues:retry'),
  send: text => ipcRenderer.invoke('create-clues:send', String(text)),
  close: () => ipcRenderer.send('create-clues:close'),
  onState: callback => ipcRenderer.on('create-clues:state', (_event, state) => callback(state))
});
