/**
 * Netie Clicks — preload (whitelist IPC).
 */

const { contextBridge, ipcRenderer } = require("electron");

const VALID_INVOKE = [
  "click:captureNow",
  "click:askBuddy",
  "click:getAppInfo",
  "clicks:getAppInfo",
  "clicks:go",
  "clicks:planActions",
  "clicks:approvePlan",
  "clicks:abortPlan",
  "clicks:brainStatus",
  "clicks:setConsent",
  "clicks:flushTelemetry",
  "clicks:onUpdateCheck",
  "clicks:exportMemory",
  "clicks:feedback",
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
  go: (payload) => safeInvoke("clicks:go", payload),
  getAppInfo: () => safeInvoke("clicks:getAppInfo"),
  planActions: (payload) => safeInvoke("clicks:planActions", payload),
  approvePlan: (payload) => safeInvoke("clicks:approvePlan", payload),
  abortPlan: () => safeInvoke("clicks:abortPlan"),
  brainStatus: () => safeInvoke("clicks:brainStatus"),
  setConsent: (partial) => safeInvoke("clicks:setConsent", partial),
  flushTelemetry: (payload) => safeInvoke("clicks:flushTelemetry", payload),
  onUpdateCheck: () => safeInvoke("clicks:onUpdateCheck"),
  exportMemory: () => safeInvoke("clicks:exportMemory"),
  feedback: (payload) => safeInvoke("clicks:feedback", payload),
  onHotkeyFired: (callback) => safeOn("click:onHotkeyFired", callback),
  onState: (callback) => safeOn("clicks:state", callback),
  onError: (callback) => safeOn("clicks:error", callback),
});
