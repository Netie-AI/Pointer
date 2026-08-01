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
    ];
    return ids.filter((id) => !document.getElementById(id));
  });
  assert.deepStrictEqual(missing, [], `missing elements: ${missing}`);
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

record("the LIVE bar renders five rolling lines from system audio", async ({ page }) => {
  // Feed the renderer the same event shape main.js sends, and read the DOM back.
  const painted = await page.evaluate(() => {
    for (let i = 1; i <= 7; i += 1) {
      window.__netieTestEmit({ type: "transcript", source: "system", text: `caption ${i}` });
    }
    const rows = [...document.querySelectorAll("#subtitle-text .live-line")];
    return {
      count: rows.length,
      first: rows[0] && rows[0].textContent,
      last: rows[rows.length - 1] && rows[rows.length - 1].textContent,
      multiline: document.getElementById("subtitle-bar").classList.contains("multiline"),
    };
  });
  assert.strictEqual(painted.count, 5, `expected 5 lines, got ${painted.count}`);
  assert.ok(painted.first.includes("caption 3"), painted.first);
  assert.ok(painted.last.includes("caption 7"), painted.last);
  assert.ok(painted.multiline, "the bar should switch to its multi-line layout");
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
