'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hint', { onContent: callback => ipcRenderer.on('hint:content', (_event, data) => callback(data)) });
