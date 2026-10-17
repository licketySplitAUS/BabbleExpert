'use strict';
// Bridge for the toolbar window. Only these named actions are available to that page.
const { contextBridge, ipcRenderer } = require('electron');
const sub = ch => cb => { const h = (_e, p) => cb(p); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('be', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: p => ipcRenderer.invoke('settings:set', p),
  getState: () => ipcRenderer.invoke('state:get'),
  action: (name, id) => ipcRenderer.invoke('action', String(name), id),
  getHistory: () => ipcRenderer.invoke('history:get'),
  menu: (name, x, y) => ipcRenderer.send('menu', { name: String(name), x, y }),
  layout: rects => ipcRenderer.send('layout', rects),
  onSettings: sub('settings'), onState: sub('state'), onStatus: sub('status'), onProgress: sub('progress'), onResources: sub('resources'), onHistory: sub('history'), onUpdate: sub('update')
});
