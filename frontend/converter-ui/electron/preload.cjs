const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('converterDesktop', {
  pickOutputDirectory: () => ipcRenderer.invoke('desktop:pick-output-directory'),
  saveFileToDirectory: (directoryPath, fileName, bytes) =>
    ipcRenderer.invoke('desktop:save-file', {
      directoryPath,
      fileName,
      bytes
    })
});
