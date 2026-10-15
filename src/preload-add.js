'use strict';
// Bridge for the Lickety Add box.
const { contextBridge, ipcRenderer } = require('electron');
const sub = ch => cb => { const h = (_e, p) => cb(p); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('be', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: p => ipcRenderer.invoke('settings:set', p),
  getState: () => ipcRenderer.invoke('state:get'),
  submit: (text, ctrl) => ipcRenderer.invoke('add:submit', { text: String(text), ctrl: !!ctrl }),
  classify: (text, ctrl) => ipcRenderer.sendSync('add:classify', { text: String(text), ctrl: !!ctrl }),
  close: () => ipcRenderer.invoke('action', 'closeAdd'),
  onSettings: sub('settings'), onState: sub('state'), onFocus: sub('focus-add')
});
