"use strict";
/**
 * Three-OS pack: linux AppImage, win zip/portable, mac zip.
 * Act stays fail-closed off Windows. Original code only.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { packId, actOs, actRefuseReason, isOsAct } = require("../electron/netie/platform");

const ROOT = path.join(__dirname, "..");
const yml = fs.readFileSync(path.join(ROOT, "electron-builder.yml"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const packJs = fs.readFileSync(path.join(ROOT, "scripts", "pack.js"), "utf8");
const packAll = fs.readFileSync(path.join(ROOT, "scripts", "pack-all.js"), "utf8");

assert.strictEqual(packId("win32"), "win");
assert.strictEqual(packId("linux"), "linux");
assert.strictEqual(packId("darwin"), "mac");
assert.strictEqual(actOs("win32"), true);
assert.strictEqual(actOs("linux"), false);
assert.strictEqual(actOs("darwin"), false);
assert.match(actRefuseReason("linux"), /fail-closed/);
assert.match(actRefuseReason("darwin"), /SendInput is Windows-only/);
assert.strictEqual(isOsAct("click"), true);
assert.strictEqual(isOsAct("wait"), false);
assert.strictEqual(isOsAct("word_docx_write"), false);

assert.strictEqual(pkg.scripts["pack:linux"], "node scripts/pack.js linux");
assert.strictEqual(pkg.scripts["pack:win"], "node scripts/pack.js win");
assert.strictEqual(pkg.scripts["pack:mac"], "node scripts/pack.js mac");
assert.strictEqual(pkg.scripts["pack:all"], "node scripts/pack-all.js");
assert.ok(pkg.devDependencies["electron-builder"]);

assert.match(yml, /productName: Pointer/);
assert.match(yml, /target: AppImage/);
assert.match(yml, /target: zip/);
assert.match(yml, /target: portable/);
assert.match(yml, /^linux:/m);
assert.match(yml, /^win:/m);
assert.match(yml, /^mac:/m);
assert.match(yml, /identity: null/);
assert.match(yml, /signAndEditExecutable: false/);
assert.doesNotMatch(yml, /clicky|cluely|openworker/i);

assert.match(packJs, /TARGETS/);
assert.match(packJs, /linux:/);
assert.match(packJs, /win:/);
assert.match(packJs, /mac:/);
assert.doesNotMatch(packJs, /xdotool|CGEvent/);
assert.match(packAll, /linux/);
assert.match(packAll, /win/);
assert.match(packAll, /mac/);
assert.match(packAll, /spawn/);

const driver = fs.readFileSync(path.join(ROOT, "electron", "netie", "driver.js"), "utf8");
assert.match(driver, /actRefuseReason/);
assert.match(driver, /isOsAct/);
assert.doesNotMatch(driver, /xdotool/);

console.log("PASS three-OS pack config is original and fail-closed off Windows");
