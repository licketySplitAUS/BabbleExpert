'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('help', { watchTour: () => ipcRenderer.send('tour:open') });
