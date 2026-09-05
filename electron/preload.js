const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("dca", {
  platform: process.platform,
});