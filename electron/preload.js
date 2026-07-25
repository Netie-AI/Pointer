/**
 * Netie Clicks — preload (whitelist IPC).
 */

const { contextBridge, ipcRenderer } = require("electron");

const VALID_INVOKE = [
  "click:captureNow",
  "click:askBuddy",
  "click:getAppInfo",
  "clicks:getAppInfo",
];
const VALID_RECEIVE = ["click:onHotkeyFired", "clicks:state", "clicks:error"];

function safeInvoke(channel, ...args) {
  if (!VALID_INVOKE.includes(channel)) {
    return Promise.reject(new Error(`Blocked IPC invoke: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args);
}

function safeOn(channel, callback) {
  if (!VALID_RECEIVE.includes(channel)) return () => {};
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("netieClick", {
  captureNow: () => safeInvoke("click:captureNow"),
  askBuddy: (payload) => safeInvoke("click:askBuddy", payload),
  getAppInfo: () => safeInvoke("clicks:getAppInfo"),
  onHotkeyFired: (callback) => safeOn("click:onHotkeyFired", callback),
  onState: (callback) => safeOn("clicks:state", callback),
  onError: (callback) => safeOn("clicks:error", callback),
});
