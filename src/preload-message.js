'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('licketyMessage', { send: text => ipcRenderer.invoke('lickety-message:send', text) });
