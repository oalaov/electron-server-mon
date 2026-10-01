const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  connect: (config) => ipcRenderer.invoke('connect', config),
  getMetrics: () => ipcRenderer.invoke('get-metrics'),
  getHistory: () => ipcRenderer.invoke('get-history'),   // ← ДОБАВИЛИ
  disconnect: () => ipcRenderer.invoke('disconnect'),
  exec: (command) => ipcRenderer.invoke('exec', command)
});