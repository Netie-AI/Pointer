"use strict";
/**
 * The HUD surface: DR-0006 §2's Computer theme, and the stacking order.
 *
 * Two things are asserted here, and both were caught by looking at a rendered
 * screenshot rather than at source - which is the reason `scripts/hud-shot.js`
 * exists at all.
 *
 * 1. **The Computer theme joins, it does not replace.** DR-0006 was ratified as
 *    a fourth theme beside dark/light/gra. Its one non-negotiable is solid
 *    fills: `backdrop-filter` corrupts on Windows Electron, so the mint surface
 *    must not carry it. Equally, the other three must KEEP their glass - a
 *    later "cleanup" that strips blur estate-wide would be the option the
 *    founder did not pick, and nothing else would notice.
 *
 * 2. **Overlay layers are named, not guessed.** The settings menu and the
 *    first-run onboard card both declared `z-index: 40`, so the winner was
 *    decided by DOM order: the card painted over the bottom half of Settings
 *    and hid five controls, "Visible to screen capture" among them. Fixing the
 *    one pair would leave the next collision to be found the same way, so the
 *    scale is the unit under test (R-0004).
 *
 * Run: node test/invariants/hud-surface.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const css = read("electron/hud.css");
const html = read("electron/hud.html");
const hudJs = read("electron/hud.js");

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

// ── DR-0006 §2 — the Computer theme ────────────────────────────────────────

check("the Computer theme exists and is selectable", () => {
  assert.ok(/\.hud\.theme-computer\s*\{/.test(css), "hud.css has no .hud.theme-computer palette");
  assert.ok(
    /data-theme="computer"/.test(html),
    "the settings menu offers no Computer button - a theme nobody can pick is not shipped"
  );
  assert.ok(
    /const THEMES = \[[^\]]*"computer"[^\]]*\]/.test(hudJs),
    "applyTheme's allowlist has no `computer` - picking it would silently fall back to dark"
  );
});

check("selecting a theme clears every other theme class", () => {
  // Two theme classes on the root means the winner is stylesheet order, not
  // the customer's choice - and it looks like a rendering bug, not a bug here.
  assert.ok(
    /classList\.remove\(\.\.\.THEMES\.map/.test(hudJs),
    "applyTheme removes a hardcoded list instead of THEMES - the two will drift"
  );
});

check("the Computer theme ships solid fills, not glass", () => {
  const palette = block(".hud.theme-computer");
  assert.ok(
    /--glass-blur:\s*none/.test(palette),
    "DR-0006 §2 requires solid fills - .hud.theme-computer must set --glass-blur: none " +
      "(backdrop-filter corrupts on Windows Electron)"
  );
  // The token is the mechanism; the override is the belt. Assert the override
  // too, so removing either one is visible.
  assert.ok(
    /\.hud\.theme-computer[^{]*\{[^}]*backdrop-filter:\s*none/s.test(css),
    "no explicit backdrop-filter: none for the computer surface"
  );
});

check("the other three themes keep their glass", () => {
  // The failure this catches is a later tidy-up that strips blur everywhere -
  // i.e. quietly converting a ratified "joins" into the "replaces" option.
  assert.ok(
    /backdrop-filter:\s*var\(--glass-blur\)/.test(css),
    "the shared .glass rule no longer applies --glass-blur - dark/light/gra lost their blur"
  );
  const root = block(":root");
  assert.ok(
    /--glass-blur:\s*blur\(/.test(root),
    ":root no longer defines a real blur - every theme is now solid, which is not what was decided"
  );
});

check("the webfont is self-hosted, and the files are actually there", () => {
  // hud.html ships default-src 'self' and no font-src, so an external @font-face
  // is refused by the page's own policy and falls back to Segoe without a word.
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  assert.ok(faces.length >= 3, `expected the Plex faces, found ${faces.length} @font-face rules`);
  for (const face of faces) {
    const url = (face.match(/url\("([^"]+)"\)/) || [])[1];
    assert.ok(url, `@font-face with no url(): ${face.slice(0, 60)}`);
    assert.ok(
      !/^https?:/.test(url),
      `@font-face loads ${url} off the network - hud.html's CSP refuses that`
    );
    const file = path.join(ROOT, "electron", url);
    assert.ok(fs.existsSync(file), `@font-face points at ${url}, which is not on disk`);
  }
  assert.ok(
    fs.existsSync(path.join(ROOT, "electron", "assets", "fonts", "NOTICE")),
    "the vendored fonts have no NOTICE - they are OFL licensed and the notice ships with them"
  );
});

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
  const declarations = css.match(/^\s*z-index:\s*\d+;/gm) || [];
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
