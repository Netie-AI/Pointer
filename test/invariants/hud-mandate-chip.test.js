"use strict";
/**
 * The mandate chip must exist on the painted chrome, and must be able to stop.
 *
 * Pointer can now act with nobody watching (`electron/netie/mandate.js`). Two
 * things follow, and neither is cosmetic:
 *
 *   a grant the customer cannot SEE is not consent
 *   a grant the customer cannot END is worse than one they never gave
 *
 * So this gate asserts the surface the customer actually receives (R-0001):
 * the chip lives in the top bar, not behind Settings; it carries its own Stop;
 * and it never renders "idle" as a side effect of failing to read the store.
 *
 * It also pins the security shape of the bridge: the renderer may READ grants
 * and END them, and has no way to CREATE one. A mandate is minted by a human
 * approval path in main, so a compromised renderer cannot grant itself the
 * right to act unattended.
 *
 * Run: node test/invariants/hud-mandate-chip.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const html = read("electron/hud.html");
const css = read("electron/hud.css");
const hud = read("electron/hud.js");
const preload = read("electron/hud-preload.js");
const main = read("electron/main.js");
const { describeMandateChip, MANDATE_URGENT_MS } = require("../../electron/netie/hud-live");

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}

/** The painted top bar, not the settings menu that lives inside it. */
function topBar() {
  const start = html.indexOf('id="top-bar"');
  const end = html.indexOf("</header>", start);
  assert.ok(start >= 0 && end > start, "hud.html no longer has a #top-bar header");
  return html.slice(start, end);
}

// ── the control exists where the customer can see it ────────────────────────

/**
 * The open-element chain above an attribute, by walking tags rather than by
 * slicing between two needles. A substring test answers "does this text sit
 * between these markers", which is not the same question as "is this nested
 * inside the menu" - and gets it wrong the moment markup is reordered.
 */
function ancestorsOf(slice, needle) {
  const target = slice.indexOf(needle);
  assert.ok(target >= 0, `${needle} not found`);
  const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "source", "path", "circle", "rect", "use"]);
  const stack = [];
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(slice))) {
    if (m.index >= target) break;
    if (m[0].startsWith("<!--")) continue;
    const [, closing, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (VOID.has(tag) || attrs.trim().endsWith("/")) continue;
    stack.push({ tag, attrs });
  }
  return stack;
}

check("the chip and its Stop live on the top bar, not nested in the Settings menu", () => {
  const bar = topBar();
  assert.ok(bar.includes('id="mandateChip"'), "#mandateChip is not on the top bar");
  assert.ok(bar.includes('id="mandateStopBtn"'), "#mandateStopBtn is not on the top bar");
  for (const needle of ['id="mandateChip"', 'id="mandateStopBtn"']) {
    const buried = ancestorsOf(bar, needle).filter((a) => /class="[^"]*\bmenu\b/.test(a.attrs));
    assert.deepStrictEqual(buried, [], `${needle} is nested inside the settings menu`);
  }
});

check("the nesting check can actually see a violation (R-0007)", () => {
  // A gate nobody has watched fail is not a gate.
  const planted = '<div class="menu open"><span id="mandateChip"></span></div>';
  assert.ok(
    ancestorsOf(planted, 'id="mandateChip"').some((a) => /class="[^"]*\bmenu\b/.test(a.attrs)),
    "the walker cannot detect a chip buried in the menu"
  );
});

check("the Stop control says what it stops, for a screen reader too", () => {
  const bar = topBar();
  const btn = bar.slice(bar.indexOf('id="mandateStopBtn"'));
  assert.match(btn, /aria-label="[^"]*[Ss]top[^"]*"/, "Stop has no descriptive aria-label");
  assert.match(bar, /id="mandateChip"[^>]*aria-live="polite"/, "the chip must announce itself when it appears");
});

check("the chip starts hidden - nothing is running at boot", () => {
  const bar = topBar();
  const chip = bar.slice(bar.indexOf('id="mandateChip"'), bar.indexOf('id="mandateChip"') + 200);
  assert.match(chip, /\bhidden\b/, "the chip must not be painted before a grant exists");
});

check("the chip is styled as a live state, with an urgent variant", () => {
  assert.ok(css.includes(".mandate-chip"), "no .mandate-chip styles");
  assert.ok(css.includes(".mandate-chip.urgent"), "no urgent variant - a chip about to lapse looks identical");
  assert.ok(
    css.includes("prefers-reduced-motion"),
    "the pulsing dot must be switchable off for reduced motion"
  );
});

// ── it is wired to the real logic, not to a lookalike ───────────────────────

check("the renderer renders from hud-live, not from its own copy of the rules", () => {
  assert.ok(
    /NetieHudLive\.describeMandateChip\(/.test(hud),
    "hud.js must call the tested describeMandateChip, or the chip is untested by construction"
  );
});

check("the chip refreshes on a clock - a missed push must not read as idle", () => {
  assert.match(hud, /setInterval\(\s*refreshMandateChip/, "the chip never re-renders after the first paint");
});

check("failing to read the store does not render as 'nothing is running'", () => {
  // R-0011: the dangerous failure is the chip vanishing while Pointer clicks on.
  const fn = hud.slice(hud.indexOf("async function refreshMandateChip"), hud.indexOf("if (mandateStopBtn)"));
  assert.ok(fn.includes("catch"), "no failure path at all");
  assert.ok(
    !/catch\s*\{\s*\}/.test(fn) && fn.includes("status unknown"),
    "a read failure must say the status is stale, not silently hide the chip"
  );
});

check("Stop actually revokes, and refreshes so the chip cannot lie afterwards", () => {
  const handler = hud.slice(hud.indexOf('mandateStopBtn.addEventListener'), hud.indexOf("setInterval(refreshMandateChip"));
  assert.ok(handler.includes('invoke("hud:revokeMandates")'), "Stop does not revoke anything");
  assert.ok(handler.includes("refreshMandateChip()"), "Stop does not re-read the state it just changed");
});

// ── the bridge shape is the security property ───────────────────────────────

check("the renderer may read and end grants, and has no way to create one", () => {
  for (const channel of ["hud:mandates", "hud:revokeMandates"]) {
    assert.ok(preload.includes(`"${channel}"`), `${channel} is not allowlisted`);
    assert.ok(main.includes(`ipcMain.handle("${channel}"`), `${channel} has no handler`);
  }
  // The whole point: authority is minted in main, by a human path.
  assert.ok(
    !/["']hud:(grant|createMandate|newMandate|mandate:grant)["']/.test(preload + hud),
    "the renderer must never be able to CREATE a mandate"
  );
});

check("revoking is announced, so Stop has visible consequence", () => {
  const handler = main.slice(main.indexOf('ipcMain.handle("hud:revokeMandates"'));
  assert.ok(handler.slice(0, 400).includes("sendHud"), "Stop revokes silently - the user cannot tell it worked");
});

// ── the logic itself ────────────────────────────────────────────────────────

const live = (over = {}) => ({
  id: "m-1",
  apps: ["outlook"],
  maxSteps: 20,
  usedSteps: 2,
  expiresAt: 600000,
  revokedAt: null,
  ...over,
});

check("no live grant means no chip", () => {
  assert.strictEqual(describeMandateChip([], 0).visible, false);
  assert.strictEqual(describeMandateChip(null, 0).visible, false);
  assert.strictEqual(describeMandateChip([live({ revokedAt: 5 })], 0).visible, false);
  assert.strictEqual(describeMandateChip([live({ expiresAt: 100 })], 200).visible, false, "expired");
  assert.strictEqual(describeMandateChip([live({ usedSteps: 20 })], 0).visible, false, "spent");
});

check("a revoked grant at timestamp 0 still hides the chip", () => {
  // Same falsy-clock trap the mandate store had: `if (m.revokedAt)` reads 0 as live.
  assert.strictEqual(describeMandateChip([live({ revokedAt: 0 })], 0).visible, false);
});

check("the chip names where it is acting, how long, and how much is left", () => {
  const v = describeMandateChip([live()], 0);
  assert.strictEqual(v.visible, true);
  assert.strictEqual(v.label, "Acting in outlook");
  assert.strictEqual(v.detail, "10m left · 18 steps");
  assert.deepStrictEqual(v.ids, ["m-1"]);
});

check("time rounds UP - a chip that can still click never reads 0m", () => {
  const v = describeMandateChip([live({ expiresAt: 61000 })], 0);
  assert.strictEqual(v.detail, "2m left · 18 steps", "61s must not render as 1m and then 0m");
  assert.strictEqual(v.urgent, false);
});

check("the last minute counts in seconds and goes urgent", () => {
  const v = describeMandateChip([live({ expiresAt: MANDATE_URGENT_MS - 1000 })], 0);
  assert.strictEqual(v.urgent, true);
  assert.match(v.detail, /^59s left/);
});

check("several grants collapse to the soonest deadline and the total budget", () => {
  const v = describeMandateChip(
    [live({ id: "m-1", expiresAt: 600000 }), live({ id: "m-2", apps: ["chrome"], expiresAt: 120000, usedSteps: 15 })],
    0
  );
  assert.strictEqual(v.label, "Acting in 2 apps");
  assert.strictEqual(v.detail, "2m left · 23 steps", "soonest expiry, summed steps");
  assert.deepStrictEqual(v.ids, ["m-1", "m-2"]);
});

check("one step is not '1 steps'", () => {
  assert.match(describeMandateChip([live({ usedSteps: 19 })], 0).detail, /1 step$/);
});

console.log(failures ? `\nhud-mandate-chip: ${failures} FAILED` : "\nhud-mandate-chip: all passed");
process.exit(failures ? 1 : 0);
