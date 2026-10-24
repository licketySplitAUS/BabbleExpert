'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('updateHighlights', {
  get: () => ipcRenderer.invoke('highlights:get'),
  acknowledge: () => ipcRenderer.invoke('highlights:acknowledge'),
  releaseNotes: () => ipcRenderer.invoke('highlights:release-notes')
});
