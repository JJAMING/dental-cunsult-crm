/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dentalConsultDesktop", {
  requestLocalApi(request) {
    return ipcRenderer.invoke("dental-consult:local-api-request", request);
  },
  getUpdateStatus() {
    return ipcRenderer.invoke("dental-consult:update-status");
  },
  checkForUpdate() {
    return ipcRenderer.invoke("dental-consult:update-check");
  },
  installUpdate() {
    return ipcRenderer.invoke("dental-consult:update-install");
  },
  subscribeToUpdateStatus(listener) {
    const callback = (_event, status) => listener(status);
    ipcRenderer.on("dental-consult:update-status", callback);

    return () => ipcRenderer.removeListener("dental-consult:update-status", callback);
  },
});
