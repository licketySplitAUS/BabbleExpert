'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('capture',{write:value=>ipcRenderer.invoke('capture:write',value),status:value=>ipcRenderer.send('capture:status',value),onCommand:callback=>ipcRenderer.on('capture:command',(_event,value)=>callback(value)),result:value=>ipcRenderer.send('capture:result',value)});
