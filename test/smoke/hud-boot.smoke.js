"use strict";
/**
 * Boots the real Electron app and inspects the real HUD.
 *
 * Everything else in this repo asserts modules and source text. Nothing until
 * now had ever seen Electron start, so "the HUD renders" was an assumption on
 * top of 329 green assertions. This is the first test that can catch a broken
 * preload, a CSP violation, a missing element, or a renderer exception.
 *
 * It only READS. It never drives the OS pointer, never runs a plan, and never
 * arms the microphone — booting a screen agent should not be able to touch the
 * machine it boots on.
 *
 * Run: npm run test:smoke     (needs a desktop session; will not work headless)
 */

const path = require("path");
const os = require("os");
const fs = require("fs");
const assert = require("assert");
const { _electron: electron } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const results = [];
const record = (name, fn) => results.push({ name, fn });

record("the app starts and the HUD window loads", async ({ page }) => {
  await page.waitForSelector("#hud", { timeout: 15000 });
  assert.ok(await page.isVisible("#hud"));
});

record("no renderer exceptions and no CSP violations on boot", async ({ errors, consoleErrors }) => {
  assert.deepStrictEqual(errors, [], `page errors: ${errors.join(" | ")}`);
  const csp = consoleErrors.filter((t) => /content security policy|refused to/i.test(t));
  assert.deepStrictEqual(csp, [], `CSP violations: ${csp.join(" | ")}`);
});

record("hud-live.js loaded before hud.js and exposed its API", async ({ page }) => {
  // If this fails, every HUD-01..06 acceptance test is passing against a module
  // the app never loads.
  const api = await page.evaluate(() => Object.keys(window.NetieHudLive || {}));
  for (const fn of ["createAutoSend", "createLiveTranscript", "createDragController"]) {
    assert.ok(api.includes(fn), `window.NetieHudLive.${fn} missing — got ${api}`);
  }
});

record("the preload bridge is wired", async ({ page }) => {
  const bridge = await page.evaluate(() => ({
    hasInvoke: typeof (window.netieHud || {}).invoke === "function",
    hasOn: typeof (window.netieHud || {}).on === "function",
    // contextIsolation must hold: the renderer gets a bridge, never Node.
    leakedRequire: typeof window.require !== "undefined",
    leakedProcess: typeof window.process !== "undefined",
  }));
  assert.strictEqual(bridge.hasInvoke, true, "netieHud.invoke missing");
  assert.strictEqual(bridge.hasOn, true, "netieHud.on missing");
  assert.strictEqual(bridge.leakedRequire, false, "require() leaked into the renderer");
  assert.strictEqual(bridge.leakedProcess, false, "process leaked into the renderer");
});

record("every element hud.js reaches for actually exists", async ({ page }) => {
  const missing = await page.evaluate(() => {
    const ids = [
      "hud", "subtitle-bar", "subtitle-text", "ask-input", "btn-act", "mode-pill",
      "enquire-panel", "enquire-fields", "autosend", "autosend-count",
      "insight-panel", "chat-dock", "point-layer", "bg-status", "nod-toast",
      "set-autosend", "set-follow", "set-capture-visible",
      "bugReportBtn", "bug-report-panel", "btn-bug-copy",
    ];
    return ids.filter((id) => !document.getElementById(id));
  });
  assert.deepStrictEqual(missing, [], `missing elements: ${missing}`);
});

record("every theme paints the system-audio icon", async ({ page }) => {
  // Adding a fourth theme found this: both <img> icons ship display:none and
  // each theme opted one in BY NAME, so `computer` matched neither list and the
  // System audio button rendered as an empty circle. Enumerate the themes the
  // stylesheet actually defines rather than a list kept here, so the next theme
  // is covered by this test on the day it is added, not the day it is noticed.
  const blank = await page.evaluate(() => {
    const hud = document.getElementById("hud");
    const themes = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        for (const m of String(rule.selectorText || "").matchAll(/\.hud\.theme-([a-z]+)/g)) {
          themes.add(m[1]);
        }
      }
    }
    themes.delete("onboarded"); // a state class, not a theme

    const had = [...hud.classList].filter((c) => c.startsWith("theme-"));
    const empty = [];
    for (const theme of themes) {
      hud.classList.remove(...[...hud.classList].filter((c) => c.startsWith("theme-")));
      hud.classList.add("theme-" + theme);
      const shown = [...document.querySelectorAll("#btn-system .sys-icon")].filter(
        (el) => getComputedStyle(el).display !== "none"
      );
      if (shown.length !== 1) {
        empty.push(`${theme} shows ${shown.length} icons`);
        continue;
      }
      // `display: block` on a broken <img> still passes a display check while
      // painting nothing, which is the same empty button by another route.
      // naturalWidth is 0 until the bitmap has actually decoded.
      if (!shown[0].naturalWidth) {
        empty.push(`${theme} shows ${shown[0].getAttribute("src")} but it did not load`);
      }
    }
    hud.classList.remove(...[...hud.classList].filter((c) => c.startsWith("theme-")));
    hud.classList.add(...had);
    return { empty, themes: [...themes] };
  });

  // Assert the enumeration worked, not a count - the number of themes differs
  // per branch, and hardcoding it makes this gate fail for the wrong reason.
  for (const known of ["dark", "light"]) {
    assert.ok(
      blank.themes.includes(known),
      `theme-${known} was not discovered from the stylesheet - the enumeration is broken, ` +
        `found: ${blank.themes.join(", ")}`
    );
  }
  assert.deepStrictEqual(
    blank.empty,
    [],
    `System audio button is wrong in: ${blank.empty.join("; ")}`
  );
});


record("the settings menu can reach every control it paints", async ({ page }) => {
  // Measured on main before this gate existed: the menu was 1255px tall on a
  // 912px viewport, `max-height: none`, `overflow-y: visible`, and six rows -
  // including "Visible to screen capture" - were painted below the bottom of
  // the display with no way to scroll to them.
  //
  // The property is not "every row is on screen". A scrollable menu is allowed
  // to keep rows below the fold. The property is that the menu fits the screen
  // AND scrolls when its content does not fit, because those two together are
  // what make every row reachable.
  const menu = await page.evaluate(() => {
    // `#btn-more` toggles, and more than one record opens this menu. Clicking
    // blind leaves the second one measuring a CLOSED menu, and that failure
    // reads as a layout bug rather than as test order. Assert the state.
    const el = document.getElementById("settings-menu");
    if (!el.classList.contains("open")) document.getElementById("btn-more").click();
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      viewportH: window.innerHeight,
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      overflowY: cs.overflowY,
      rows: el.querySelectorAll("label").length,
    };
  });

  assert.ok(menu.rows > 0, "the settings menu paints no rows");
  assert.ok(
    menu.bottom <= menu.viewportH + 1,
    `the settings menu runs to ${menu.bottom}px on a ${menu.viewportH}px screen - ` +
      "everything past the bottom edge is painted where nobody can click it"
  );
  if (menu.scrollH > menu.clientH + 1) {
    assert.ok(
      /auto|scroll/.test(menu.overflowY),
      `the menu's content is ${menu.scrollH}px inside a ${menu.clientH}px box but ` +
        `overflow-y is "${menu.overflowY}" - the rows past the fold cannot be reached`
    );
  }
});

record("every control in the top bar can be clicked at its own centre", async ({ page }) => {
  // The box-inside-box check this replaces asserted that controls sit within
  // the bar and are one line tall. Both can hold while a control is dead: an
  // adjacent element that overlaps it wins the pixel, and the customer's click
  // goes somewhere else entirely. That is what the customer receives (R-0001),
  // so hit-test it - do not measure a proxy for it.
  const dead = await page.evaluate(() => {
    const bar = document.getElementById("top-bar");
    const out = [];
    for (const el of bar.querySelectorAll("button")) {
      // The settings menu is nested in the bar but is a scrolling popover with
      // its own reachability gate. Rows below its fold legitimately own no
      // pixel, and counting them here reports the menu as broken chrome.
      if (el.closest("#settings-menu")) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue; // hidden by mode, not a layout fault
      if (getComputedStyle(el).pointerEvents === "none") continue;
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const mine = hit && (hit === el || el.contains(hit));
      if (!mine) {
        const owner = hit ? (hit.id || hit.className || hit.tagName) : "nothing";
        out.push(`${el.id || el.textContent.trim().slice(0, 18)} -> ${String(owner).slice(0, 30)}`);
      }
    }
    return out;
  });
  assert.deepStrictEqual(
    dead,
    [],
    `top-bar controls whose own centre belongs to something else: ${dead.join("; ")}`
  );
});

record("the top bar fits its own controls", async ({ page }) => {
  // The bar carries Record, transport, four modes, Ask AI, two icons, the menu,
  // Report a problem and Show/Hide. It used to cap at 980px while `.top-cluster`
  // allowed shrinking below content, so the overflow was paid in wrapped labels
  // and a clipped kbd - visible in a screenshot, invisible to every assertion
  // in this repo. Measure the rendered boxes: a control that sticks out of the
  // bar, or grows to two lines, is the defect either way.
  const report = await page.evaluate(() => {
    const bar = document.getElementById("top-bar");
    const barBox = bar.getBoundingClientRect();
    const overflowing = [];
    const wrapped = [];
    for (const el of bar.querySelectorAll("button")) {
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue; // hidden by mode, not a layout fault
      const name = (el.id || el.textContent.trim() || el.title).slice(0, 30);
      // 0.5px of tolerance: sub-pixel layout, not a real overhang.
      if (box.left < barBox.left - 0.5 || box.right > barBox.right + 0.5) {
        overflowing.push(`${name} [${Math.round(box.left)}..${Math.round(box.right)}]`);
      }
      // Every control in this bar is a single-line pill. Measured: a wrapped
      // pill is exactly 44.0px and an unwrapped one is under 32px, so the old
      // `> 44` threshold sat ON the value it was meant to catch and could
      // never fire. 38px sits in the gap.
      if (box.height > 38) wrapped.push(`${name} (${Math.round(box.height)}px tall)`);
    }
    return {
      overflowing,
      wrapped,
      barWidth: Math.round(barBox.width),
      viewport: window.innerWidth,
      fitsViewport: barBox.left >= -0.5 && barBox.right <= window.innerWidth + 0.5,
    };
  });

  assert.deepStrictEqual(
    report.overflowing,
    [],
    `controls hang outside the top bar (bar ${report.barWidth}px): ${report.overflowing.join(", ")}`
  );
  assert.deepStrictEqual(
    report.wrapped,
    [],
    `controls wrapped to a second line: ${report.wrapped.join(", ")}`
  );
  assert.strictEqual(
    report.fitsViewport,
    true,
    `the top bar (${report.barWidth}px) runs off a ${report.viewport}px screen`
  );
});


record("the onboard card never covers the settings menu", async ({ page }) => {
  // A screenshot found this one, and a source assertion had already blessed it:
  // .onboard and .menu both declared z-index: 40, so DOM order decided and on a
  // fresh profile the first-run card painted over five rows of Settings.
  //
  // The first version of this gate scrolled the target row into view before
  // hit-testing. scrollIntoView walks up to a COMMON ancestor of the menu and
  // the card, so it dragged the card off the top of the screen and then
  // certified that nothing was covered - passing with the defect fully
  // restored. Move nothing. Ask where the two panels actually overlap, at rest,
  // and find out who owns that pixel.
  const hit = await page.evaluate(() => {
    const hud = document.getElementById("hud");
    hud.classList.remove("onboarded", "theme-onboarded"); // first-run state
    const onboard = document.getElementById("onboard");
    onboard.hidden = false;
    const menu = document.getElementById("settings-menu");
    if (!menu.classList.contains("open")) document.getElementById("btn-more").click();

    const a = onboard.getBoundingClientRect();
    const b = menu.getBoundingClientRect();
    const x1 = Math.max(a.left, b.left);
    const x2 = Math.min(a.right, b.right);
    const y1 = Math.max(a.top, b.top);
    const y2 = Math.min(a.bottom, b.bottom);
    if (x2 <= x1 || y2 <= y1) return { overlap: false };

    const top = document.elementFromPoint((x1 + x2) / 2, (y1 + y2) / 2);
    const covered = [...menu.querySelectorAll("label")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > a.top && r.top < a.bottom && r.right > a.left && r.left < a.right;
      })
      .map((el) => el.textContent.trim().replace(/\s+/g, " ").slice(0, 30));

    return {
      overlap: true,
      area: Math.round((x2 - x1) * (y2 - y1)),
      inMenu: Boolean(top && top.closest("#settings-menu")),
      inOnboard: Boolean(top && top.closest("#onboard")),
      hitTag: top ? top.tagName + (top.id ? "#" + top.id : "") : "nothing",
      covered,
    };
  });

  // No overlap means this gate proves nothing. Say so rather than pass quietly:
  // a layout change that separates the two panels should send someone to
  // re-point this test, not silently retire it (R-0002).
  assert.strictEqual(
    hit.overlap,
    true,
    "the onboard card and the settings menu no longer share any pixels - this gate " +
      "is vacuous now and needs re-pointing at whatever overlaps today"
  );
  assert.strictEqual(
    hit.inOnboard,
    false,
    `the onboard card owns ${hit.area}px of the open settings menu, covering: ${hit.covered.join(", ")}`
  );
  assert.strictEqual(
    hit.inMenu,
    true,
    `the contested pixel belongs to ${hit.hitTag}, not the settings menu`
  );
});

record("the General mode pill shipped", async ({ page }) => {
  const modes = await page.$$eval("#mode-pill button", (els) => els.map((e) => e.dataset.mode));
  assert.ok(modes.includes("general"), `HUD-03 pill missing — got ${modes}`);
  assert.ok(modes.includes("agent"));
});

record("capture is disarmed at boot — nothing is listening", async ({ page }) => {
  const state = await page.evaluate(() => ({
    label: (document.getElementById("rec-label") || {}).textContent,
    recActive: (document.getElementById("btn-listen") || { classList: { contains: () => false } })
      .classList.contains("active"),
  }));
  assert.strictEqual(state.label, "Record", "the record button must not say Recording at boot");
  assert.strictEqual(state.recActive, false, "the mic must not be armed by starting the app");
});

record("the enquire panel is a real form and starts hidden", async ({ page }) => {
  const form = await page.evaluate(() => {
    const el = document.getElementById("enquire-panel");
    return { tag: el && el.tagName, hidden: el && el.hidden };
  });
  assert.strictEqual(form.tag, "FORM", "enquire must be a <form> for Enter-to-submit");
  assert.strictEqual(form.hidden, true, "it must not be in the way at boot");
});

// ── #22 · the redesigned chrome, asserted against the RENDERED HUD ──────────
// EPIC-P05's chrome shipped with no assertion covering any of it: nothing failed
// if the LIVE bar came back, if the insight toggle stopped flipping, or if the
// status pill stopped rendering. These four run against the real DOM, because a
// grep for `status-pill` in hud.html passes even though the element ships with
// `hidden` set — asserting the source would certify a pill nobody can ever see.

record("#22 no separate draggable LIVE subtitle bar is presented", async ({ page }) => {
  const bar = await page.evaluate(() => {
    const el = document.getElementById("subtitle-bar");
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      present: true,
      // Deliberately NOT `el.hidden`. The attribute was set and the bar rendered
      // anyway, because `.subtitle-live` carries its own `display: flex`. Only
      // the rendered geometry can answer "can the customer see this".
      attribute: el.hidden,
      display: cs.display,
      visibility: cs.visibility,
      paintedArea: box.width * box.height,
      dragHandles: el.querySelectorAll(".drag-handle").length,
    };
  });
  if (bar.present) {
    assert.strictEqual(
      bar.paintedArea,
      0,
      `the draggable LIVE subtitle bar is painting ${bar.paintedArea}px² ` +
        `(display:${bar.display}, visibility:${bar.visibility}, hidden attr:${bar.attribute})`
    );
    assert.strictEqual(bar.display, "none", "the LIVE bar is still laid out");
  }
});

record("#22 transcripts render in the insights panel, not a floating bar", async ({ page }) => {
  const painted = await page.evaluate(() => {
    // Flip to the transcripts view the way a customer would.
    [...document.querySelectorAll(".insight-tab")]
      .find((b) => b.dataset.insightView === "transcripts")
      .click();
    for (let i = 1; i <= 7; i += 1) {
      window.__netieTestEmit({ type: "transcript", source: "system", text: `caption ${i}` });
    }
    const rows = [...document.querySelectorAll("#transcript-feed .live-line")];
    return {
      count: rows.length,
      first: rows[0] && rows[0].textContent,
      last: rows[rows.length - 1] && rows[rows.length - 1].textContent,
    };
  });
  assert.strictEqual(painted.count, 5, `expected 5 rolling lines, got ${painted.count}`);
  assert.ok(painted.first.includes("caption 3"), painted.first);
  assert.ok(painted.last.includes("caption 7"), painted.last);
});

record("#22 the insights panel flips between AI insights and transcripts", async ({ page }) => {
  const flip = await page.evaluate(() => {
    const tab = (view) =>
      [...document.querySelectorAll(".insight-tab")].find((b) => b.dataset.insightView === view);
    const shown = () => ({
      ai: !document.getElementById("insight-ai-view").hidden,
      transcripts: !document.getElementById("insight-transcript-view").hidden,
    });
    tab("ai").click();
    const onAi = shown();
    tab("transcripts").click();
    const onTranscripts = shown();
    tab("ai").click();
    const backToAi = shown();
    return { onAi, onTranscripts, backToAi, tabs: document.querySelectorAll(".insight-tab").length };
  });
  assert.strictEqual(flip.tabs, 2, "the AI | Transcripts toggle is missing");
  assert.deepStrictEqual(flip.onAi, { ai: true, transcripts: false }, "AI insights view broken");
  assert.deepStrictEqual(
    flip.onTranscripts,
    { ai: false, transcripts: true },
    "the panel does not flip to transcripts"
  );
  assert.deepStrictEqual(flip.backToAi, { ai: true, transcripts: false }, "the flip is one-way");
});

record("#22 suggest and status render in the fixed top chrome", async ({ page }) => {
  const chrome = await page.evaluate(() => {
    const visible = (el) => {
      if (!el || el.hidden) return false;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      return el.getBoundingClientRect().height > 0;
    };
    // Suggest: always-on chrome, inside the HUD's own panel.
    const suggest = document.querySelectorAll("#insight-actions button");
    const suggestPanel = document.getElementById("insight-panel");

    // Status: ships hidden, so DRIVE it the way main.js does and read it back.
    window.__netieTestEmit({
      type: "word-docx",
      path: "C:\\Users\\demo\\Documents\\NetiePointer\\report.docx",
      bytes: 4096,
    });
    const pill = document.getElementById("status-pill");
    return {
      suggestCount: suggest.length,
      suggestVisible: visible(suggestPanel),
      suggestIsChrome: suggestPanel.classList.contains("chrome"),
      pillVisible: visible(pill),
      pillIsChrome: pill.classList.contains("chrome"),
      pillTitle: (document.getElementById("status-title") || {}).textContent || "",
      // #19's acceptance: the destination is shown BEFORE Open is offered.
      pillSub: (document.getElementById("status-sub") || {}).textContent || "",
      openOffered: !document.getElementById("btn-status-open").hidden,
    };
  });
  assert.ok(chrome.suggestCount >= 3, `suggest pills missing — got ${chrome.suggestCount}`);
  assert.strictEqual(chrome.suggestVisible, true, "suggest is not rendered in the chrome");
  assert.strictEqual(chrome.suggestIsChrome, true, "the suggest panel is not HUD chrome");
  assert.strictEqual(chrome.pillVisible, true, "the status pill never renders");
  assert.strictEqual(chrome.pillIsChrome, true, "the status pill is not HUD chrome");
  assert.ok(/document ready/i.test(chrome.pillTitle), `pill title was "${chrome.pillTitle}"`);
  assert.strictEqual(chrome.openOffered, true, "a finished document offers no way to open it");
  assert.ok(
    chrome.pillSub.includes("report.docx"),
    `the destination must be shown before Open is offered — sub was "${chrome.pillSub}"`
  );
});

record("#22 no cursor-following floating chat identity came back", async ({ page }) => {
  // DR-0002 / CLAUDE.md Hard rule 3 — these are the shapes that must stay dead.
  const revived = await page.evaluate(() =>
    ["clicky-orb", "stage-orb", "peek-drop", "chat-bubble"].filter((id) =>
      document.getElementById(id)
    )
  );
  assert.deepStrictEqual(revived, [], `floating chat identity is back: ${revived}`);
});

record("a transcript populates the Ask box and does NOT send itself", async ({ page }) => {
  const out = await page.evaluate(() => {
    document.getElementById("ask-input").value = "";
    window.__netieTestEmit({ type: "transcript", source: "mic", text: "open the invoice" });
    return {
      composer: document.getElementById("ask-input").value,
      countdownShown: document.getElementById("autosend").classList.contains("armed"),
    };
  });
  assert.ok(out.composer.includes("open the invoice"), "speech must land in the composer");
  assert.strictEqual(out.countdownShown, false, "auto-send is off by default — nothing should arm");
});

record("an upstream failure shows the fix, not the proxy's wall of text", async ({ page }) => {
  const shown = await page.evaluate(() => {
    window.__netieTestEmit({
      type: "answer",
      meta: "No model key in OpenVault",
      text: "No model key in OpenVault — Add GEMINI_API_KEY to D:\\OpenVault\\.env.local and restart OpenVault.",
    });
    const msgs = [...document.querySelectorAll("#messages .msg")];
    return msgs.length ? msgs[msgs.length - 1].textContent : "";
  });
  assert.ok(/GEMINI_API_KEY/.test(shown), "the message must name the fix");
  assert.ok(!/litellm|openrouter|non[_ -]?retryable/i.test(shown), "no proxy chatter in the UI");
});

/**
 * Pointer is a tray app: `window-all-closed` calls preventDefault(), so it is
 * built never to quit when its windows close. `app.close()` waits for a quit
 * that will never come, so the run hangs after the last assertion. Kill the
 * process instead, and never let teardown decide whether the suite passed.
 */
async function shutdown(app, code) {
  // Hard watchdog first. The results are already printed by the time we get
  // here, so a teardown that stalls must never turn a passing run into a hung
  // one — and on Windows the Electron children inherit stdout, so a stalled
  // exit also leaves the calling shell waiting on a pipe that never closes.
  const watchdog = setTimeout(() => process.exit(code), 5000);
  watchdog.unref();

  try {
    const proc = app.process();
    await Promise.race([app.close(), new Promise((r) => setTimeout(r, 3000))]);
    if (proc && proc.pid) {
      // /T kills the whole tree: the GPU, network and renderer children are
      // separate processes and each one holds the inherited stdout pipe open.
      try {
        require("child_process").execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch {
        /* already reaped */
      }
    }
  } catch {
    /* teardown is best-effort */
  }
  process.exit(code);
}

(async () => {
  // A separate userData dir does two jobs: Electron keys its single-instance
  // lock on that path, so this does not fight (or get killed by) a Pointer the
  // user already has running — and the test cannot touch their real settings,
  // profile or notes.
  const profileDir = path.join(os.tmpdir(), `netie-smoke-${process.pid}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const app = await electron.launch({
    args: [path.join(ROOT, "electron", "main.js"), `--user-data-dir=${profileDir}`],
    cwd: ROOT,
    env: {
      ...process.env,
      // Boot the UI only: no STT child process, no telemetry, no key hunting.
      NETIE_STT_AUTOSTART: "0",
      NETIE_SMOKE: "1",
    },
  });

  const errors = [];
  const consoleErrors = [];
  let page;
  try {
    page = await app.firstWindow({ timeout: 20000 });
    page.on("pageerror", (e) => errors.push(String(e && e.message ? e.message : e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await page.waitForLoadState("domcontentloaded");
    // A test hook, not a product path: hand the renderer's own event handler a
    // synthetic event so we can assert what it paints.
    await page.evaluate(() => {
      window.__netieTestEmit = window.__netieOnEvent || (() => {});
    });
    await page.waitForTimeout(1200); // let hud:ready settle

    let pass = 0;
    const fails = [];
    for (const t of results) {
      try {
        await t.fn({ page, app, errors, consoleErrors });
        pass += 1;
        console.log("PASS " + t.name);
      } catch (err) {
        fails.push(t.name);
        console.log("FAIL " + t.name + " — " + (err && err.message ? err.message : err));
      }
    }
    console.log(`\n${pass} passed, ${fails.length} failed`);
    await shutdown(app, fails.length === 0 ? 0 : 1);
  } catch (err) {
    console.log("FAIL smoke harness — " + (err && err.message ? err.message : err));
    await shutdown(app, 1);
  }
})();
