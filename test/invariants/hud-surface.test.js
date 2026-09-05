"use strict";
/**
 * Overlay layers are named, not guessed.
 *
 * Four selectors in hud.css declared `z-index: 40` at once - .peek-drop,
 * .point-layer, .onboard and .menu - so the winner was decided by DOM order.
 * Two of them are dead rules with no element in the HUD, so the live collision
 * was three-way; the scale covers all of them either way.
 * The onboard card is later in hud.html than the settings menu, which meant
 * that on a fresh profile the first-run card painted over five rows in the
 * middle of Settings and took their clicks. (Which five depends on the layout,
 * so the rendered gate names them; this header does not.)
 *
 * Fixing the one pair would have left the next collision to be found the same
 * way it was found this time: by looking at a screenshot. So the scale is the
 * unit under test (R-0004), and the rendered half - what is actually on top at
 * the pixel the customer clicks - lives in test/smoke/hud-boot.smoke.js, since
 * only the renderer can answer that.
 *
 * Run: node test/invariants/hud-surface.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const css = read("electron/hud.css");

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

/** The declarations inside one rule block, by selector. */
function block(selector) {
  const at = css.indexOf(selector + " {");
  assert.ok(at >= 0, `no rule for ${selector}`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

// ── the stacking scale ──────────────────────────────────────────────────────

/** Every --z-* token declared on .hud, as a name -> number map. */
function layers() {
  const hud = block(".hud");
  const found = {};
  for (const [, name, value] of hud.matchAll(/--z-([a-z]+):\s*(\d+);/g)) {
    found[name] = Number(value);
  }
  return found;
}

check("overlay layers are named, not literal numbers", () => {
  // Anchoring this to the start of a line missed most of the stylesheet, which
  // writes several declarations per line: a mid-line `z-index: 999` sailed
  // through while the gate stayed green. Strip comments - the header quotes
  // `z-index: 40` in prose - and then scan anywhere.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const declarations = code.match(/z-index:\s*\d+/g) || [];
  assert.deepStrictEqual(
    declarations.map((d) => d.trim()),
    [],
    "a rule declares a bare numeric z-index - use a --z-* layer so the order stays intentional"
  );
  const scale = layers();
  assert.ok(Object.keys(scale).length >= 10, `only ${Object.keys(scale).length} layers defined`);
});

check("the settings menu outranks the onboard card at the layer that decides it", () => {
  // The defect, stated as the thing that must stay true: opening Settings on a
  // fresh profile must not put five controls behind a splash card.
  //
  // The first version of this check compared --z-menu against --z-onboard, and
  // passed while the card still covered the menu in a screenshot. `.menu` is a
  // descendant of `.top-bar`, which is positioned WITH a z-index and therefore
  // opens a stacking context; against anything outside that bar the menu is
  // worth --z-chrome, no matter what --z-menu says. Compare the layer that
  // actually decides, or this gate certifies the bug it was written for.
  const { chrome, menu, onboard } = layers();
  assert.ok(
    chrome !== undefined && menu !== undefined && onboard !== undefined,
    "--z-chrome / --z-menu / --z-onboard missing"
  );
  assert.ok(
    /\.top-bar\s*\{[^}]*z-index:\s*var\(--z-chrome\)/s.test(css),
    "the top bar no longer carries --z-chrome - re-derive which layer contains the menu"
  );
  assert.ok(
    chrome > onboard,
    `the menu is nested in .top-bar (--z-chrome ${chrome}), so --z-onboard (${onboard}) must ` +
      "sit below THAT. Equal or higher and the onboard card covers the bottom of the settings " +
      "menu, including Visible to screen capture"
  );
  assert.ok(menu > chrome, `--z-menu (${menu}) should still top its own bar (--z-chrome ${chrome})`);
});

check("teach marks stay above every panel", () => {
  const scale = layers();
  const others = Object.entries(scale).filter(([name]) => name !== "teach");
  for (const [name, value] of others) {
    assert.ok(
      scale.teach > value,
      `--z-teach (${scale.teach}) is not above --z-${name} (${value}) - a crosshair that ` +
        "points at the UI cannot render underneath it"
    );
  }
});

check("no two layers share a number", () => {
  // Sharing a value is exactly the state the menu and the onboard card were in:
  // legal CSS, resolved by DOM order, and wrong in a way only a picture shows.
  const scale = layers();
  const seen = new Map();
  for (const [name, value] of Object.entries(scale)) {
    if (seen.has(value)) {
      assert.fail(`--z-${name} and --z-${seen.get(value)} are both ${value} - DOM order decides`);
    }
    seen.set(value, name);
  }
});

console.log(`\nhud surface invariants: ${failures === 0 ? "all passed" : failures + " failed"}`);
process.exit(failures === 0 ? 0 : 1);
