/* AZMA Settings — renderer bridge for native APIs */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('azma', {
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  getStatus: () => ipcRenderer.invoke('updater:status'),
  onUpdateProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },
  onUpdateApplied: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('updater:applied', listener);
    return () => ipcRenderer.removeListener('updater:applied', listener);
  },
});
