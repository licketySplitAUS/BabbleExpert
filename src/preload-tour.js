'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tourHost', {
  getLaunch: () => ipcRenderer.invoke('tour:launch'),
  action: action => { if (['close', 'started', 'completed'].includes(action)) ipcRenderer.send('tour:action', action); },
  onLaunch: callback => ipcRenderer.on('tour:replay', (_event, launch) => callback(launch))
});
