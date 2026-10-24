'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('journal', {
  get: () => ipcRenderer.invoke('journal:get'),
  enable: enabled => ipcRenderer.invoke('journal:enabled', enabled),
  clear: () => ipcRenderer.invoke('journal:clear'),
  export: () => ipcRenderer.invoke('journal:export'),
  onChanged: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('journal:changed', listener); return () => ipcRenderer.removeListener('journal:changed', listener); }
});
