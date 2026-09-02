#!/usr/bin/env node
"use strict";
/**
 * Pack Pointer for one OS. Usage: node scripts/pack.js linux|win|mac
 * Act stays fail-closed off Windows. Never vendors Clicky/Cluely.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const TARGETS = {
  linux: ["--linux", "AppImage", "dir", "--x64"],
  win: ["--win", "zip", "portable", "--x64"],
  mac: ["--mac", "zip", "--x64"],
};

const want = String(process.argv[2] || "").toLowerCase();
const args = TARGETS[want];
if (!args) {
  console.error("usage: node scripts/pack.js linux|win|mac");
  process.exit(2);
}

const bin = path.join(__dirname, "..", "node_modules", ".bin", "electron-builder");
const r = spawnSync(bin, args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status == null ? 1 : r.status);
