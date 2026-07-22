/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dentalConsultDesktop", {
  requestLocalApi(request) {
    return ipcRenderer.invoke("dental-consult:local-api-request", request);
  },
});
