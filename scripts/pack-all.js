#!/usr/bin/env node
"use strict";
/**
 * Pack linux + win + mac at the same time. Each child is node scripts/pack.js.
 */
const { spawn } = require("child_process");
const path = require("path");

const pack = path.join(__dirname, "pack.js");
const kids = ["linux", "win", "mac"].map((os) => {
  const child = spawn(process.execPath, [pack, os], { stdio: "inherit" });
  return { os, child, code: null };
});

let left = kids.length;
let failed = 0;
kids.forEach((row) => {
  row.child.on("exit", (code) => {
    row.code = code == null ? 1 : code;
    if (row.code !== 0) failed += 1;
    console.log("pack " + row.os + " exit " + row.code);
    left -= 1;
    if (left === 0) process.exit(failed ? 1 : 0);
  });
});
