'use strict';
// Bridge for the Lickety Add box.
const { contextBridge, ipcRenderer } = require('electron');
const sub = ch => cb => { const h = (_e, p) => cb(p); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('be', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: p => ipcRenderer.invoke('settings:set', p),
  getState: () => ipcRenderer.invoke('state:get'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  restoreEntry: id => ipcRenderer.invoke('action', 'restoreEntry', id),
  submit: (text, ctrl) => ipcRenderer.invoke('add:submit', { text: String(text), ctrl: !!ctrl }),
  preview: text => ipcRenderer.send('add:preview', String(text || '')),
  finish: (text, color) => ipcRenderer.send('add:finish', { text: String(text || ''), color: String(color || '') }),
  classify: (text, ctrl) => ipcRenderer.sendSync('add:classify', { text: String(text), ctrl: !!ctrl }),
  close: () => ipcRenderer.invoke('action', 'closeAdd'),
  hint: data => ipcRenderer.send('hint', data),
  onHintDismiss: sub('hint-dismiss'),
  onSettings: sub('settings'), onState: sub('state'), onFocus: sub('focus-add'), onResourceSubmit: sub('resource-submit'), onHistory: sub('history'), onRestore: sub('restore-entry'), onResult: sub('submission-result')
});
