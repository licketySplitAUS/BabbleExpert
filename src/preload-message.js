'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('licketyMessage', {
  send: text => ipcRenderer.invoke('lickety-message:send', text),
  identity: () => ipcRenderer.invoke('lickety-message:identity'),
  unlink: () => ipcRenderer.invoke('lickety-message:unlink'),
});
