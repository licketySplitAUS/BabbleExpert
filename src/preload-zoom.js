'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('zoomMenu', {
  get: () => ipcRenderer.invoke('zoom:get'),
  change: direction => ipcRenderer.invoke('zoom:change', direction),
  onState: callback => ipcRenderer.on('zoom:state', (_event, zoom) => callback(zoom))
});
