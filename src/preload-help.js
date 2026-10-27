'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('help', {
  copySupport: () => ipcRenderer.invoke('help:copy-support'),
  releaseNotes: request => ipcRenderer.invoke('help:release-notes', request),
  onTopic: callback => ipcRenderer.on('help:topic', (_event, topic) => callback(topic)),
});
