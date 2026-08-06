"use strict";
/**
 * Drives the REAL IPC bridge in a booted app.
 *
 * `hud-boot.smoke.js` proves the HUD renders. This proves the buttons on it can
 * actually reach the main process and come back with the right answer — which is
 * a different question, and the one that was silently wrong: `hud:openPath`
 * shipped with a handler and a caller but no preload allowlist entry, so the
 * status pill's Open button was rejected on every click while every test stayed
 * green.
 *
 * Everything here goes through `window.netieHud.invoke`, i.e. the same path a
 * click takes, allowlist included. It only READS and opens nothing outside a
 * temp directory it created itself.
 *
 * Run: npm run test:smoke:ipc   (needs a desktop session)
 */

const path = require("path");
const os = require("os");
const fs = require("fs");
const assert = require("assert");
const { _electron: electron } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const results = [];
const record = (name, fn) => results.push({ name, fn });

/** Call a channel exactly as a HUD button would, allowlist and all. */
const call = (page, channel, payload) =>
  page.evaluate(
    ([c, p]) =>
      window.netieHud.invoke(c, p).then(
        (value) => ({ resolved: true, value }),
        (err) => ({ resolved: false, error: String((err && err.message) || err) })
      ),
    [channel, payload]
  );

record("every channel the HUD invokes survives the preload allowlist", async ({ page }) => {
  // Read the channels straight out of the shipped renderer, so this cannot
  // drift from what the buttons actually call.
  const hudSrc = fs.readFileSync(path.join(ROOT, "electron", "hud.js"), "utf8");
  const channels = [...new Set([...hudSrc.matchAll(/invoke\(\s*"([^"]+)"/g)].map((m) => m[1]))];
  assert.ok(channels.length > 20, `parser found only ${channels.length} channels`);

  const blocked = await page.evaluate(async (list) => {
    const out = [];
    for (const c of list) {
      try {
        // A blocked channel rejects synchronously in the preload, before any
        // handler runs. Passing no payload is fine: we only care which door opens.
        await window.netieHud.invoke(c, undefined);
      } catch (err) {
        const msg = String((err && err.message) || err);
        if (msg.startsWith("blocked ")) out.push(c);
      }
    }
    return out;
  }, channels);

  assert.deepStrictEqual(blocked, [], `rejected by the preload allowlist: ${blocked.join(", ")}`);
});

record("hud:openPath refuses a script inside a sanctioned folder", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-ipc-"));
  const bat = path.join(dir, "payload.bat");
  fs.writeFileSync(bat, "@echo off\r\n");
  const r = await call(page, "hud:openPath", { path: bat });
  assert.strictEqual(r.resolved, true, `channel was blocked: ${r.error}`);
  assert.strictEqual(r.value.ok, false, "a .bat was handed to the shell");
  assert.ok(/refused/i.test(r.value.error), `reason was: ${r.value.error}`);
});

record("hud:openPath refuses a document outside every sanctioned root", async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-ipc-"));
  const doc = path.join(dir, "outside.docx");
  fs.writeFileSync(doc, "x");
  const r = await call(page, "hud:openPath", { path: doc });
  assert.strictEqual(r.resolved, true, `channel was blocked: ${r.error}`);
  assert.strictEqual(r.value.ok, false, "an uncontained path reached the shell");
  assert.ok(
    r.value.error.toLowerCase().includes("outside"),
    `the refusal should name the containment failure — got: ${r.value.error}`
  );
});

record("hud:openPath refuses a traversal that climbs out of a root", async ({ page }) => {
  const r = await call(page, "hud:openPath", { path: "C:\\Windows\\System32\\cmd.exe" });
  assert.strictEqual(r.resolved, true, `channel was blocked: ${r.error}`);
  assert.strictEqual(r.value.ok, false, "cmd.exe was handed to the shell");
});

record("hud:sttStatus answers, so hold-to-talk can gate on a real engine", async ({ page }) => {
  // #25 refuses to capture when the engine is "none". That decision is only as
  // good as this channel actually answering.
  const r = await call(page, "hud:sttStatus", {});
  assert.strictEqual(r.resolved, true, `channel was blocked: ${r.error}`);
  assert.ok(r.value && typeof r.value.engine === "string", `no engine in ${JSON.stringify(r.value)}`);
});

record("hud:getSettings round-trips the cloud-STT consent flag", async ({ page }) => {
  // #21's fix reads this on every probe; if the channel does not carry the flag,
  // consent can never be revoked from the UI at all.
  const r = await call(page, "hud:getSettings", {});
  assert.strictEqual(r.resolved, true, `channel was blocked: ${r.error}`);
  // The handler answers {ok, settings}; the renderer reads `result.settings`.
  const settings = r.value && (r.value.settings || r.value);
  assert.ok(settings, "no settings came back");
  assert.ok("cloudStt" in settings, `cloudStt missing from settings: ${Object.keys(settings)}`);
  assert.strictEqual(
    settings.cloudStt,
    false,
    "cloud STT must be opt-in — audio leaving the device is never the default"
  );
});

record("the status pill's Open button is wired to a channel that answers", async ({ page }) => {
  // The end-to-end version of the regression: drive the real event, click the
  // real button, and assert the pill reports a refusal instead of vanishing.
  const outcome = await page.evaluate(async () => {
    window.__netieTestEmit({ type: "word-docx", path: "C:\\Windows\\System32\\cmd.exe", bytes: 1 });
    document.getElementById("btn-status-open").click();
    await new Promise((r) => setTimeout(r, 700));
    const pill = document.getElementById("status-pill");
    return {
      stillVisible: !pill.hidden,
      title: document.getElementById("status-title").textContent,
      sub: document.getElementById("status-sub").textContent,
    };
  });
  assert.strictEqual(outcome.stillVisible, true, "the pill vanished, taking the refusal with it");
  assert.ok(/could not open/i.test(outcome.title), `pill title was "${outcome.title}"`);
  assert.ok(outcome.sub && outcome.sub.length, "the refusal reason was never shown");
});

record("a run raises the status pill and takes it back down", async ({ page }) => {
  // The pill only ever appeared for a finished .docx, so an Act run showed no
  // progress at all. main.js now drives it from executeApproved; this asserts
  // the renderer honours both halves, including `done`.
  const seen = await page.evaluate(async () => {
    const pill = document.getElementById("status-pill");
    window.__netieTestEmit({ type: "status", title: "Working...", sub: "3 steps: launch, type, write" });
    const during = {
      visible: !pill.hidden,
      title: document.getElementById("status-title").textContent,
      sub: document.getElementById("status-sub").textContent,
    };
    window.__netieTestEmit({ type: "status", title: "Step 2 of 3", sub: 'Click "Send"' });
    const mid = document.getElementById("status-title").textContent;
    window.__netieTestEmit({ type: "status", done: true });
    await new Promise((r) => setTimeout(r, 100));
    return { during, mid, afterHidden: pill.hidden };
  });
  assert.strictEqual(seen.during.visible, true, "a run shows no progress at all");
  assert.ok(/working/i.test(seen.during.title), `title was "${seen.during.title}"`);
  assert.ok(seen.during.sub.length, "the pill says nothing about what is happening");
  assert.ok(/step 2 of 3/i.test(seen.mid), `per-step progress missing — got "${seen.mid}"`);
  assert.strictEqual(seen.afterHidden, true, "the pill sat on Working... after the run finished");
});

(async () => {
  const app = await electron.launch({ args: [path.join(ROOT, "electron", "main.js")], cwd: ROOT });
  let page;
  let failed = 0;
  try {
    page = await app.firstWindow({ timeout: 20000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("#hud", { timeout: 20000 });
    await page.evaluate(() => {
      window.__netieTestEmit = window.__netieOnEvent || (() => {});
    });
    await page.waitForTimeout(1200);

    let pass = 0;
    for (const t of results) {
      try {
        await t.fn({ page, app });
        pass += 1;
        console.log("PASS " + t.name);
      } catch (err) {
        failed += 1;
        console.log("FAIL " + t.name + " — " + (err && err.message ? err.message : err));
      }
    }
    console.log(`\n${pass} passed, ${failed} failed`);
  } finally {
    // Same teardown as hud-boot.smoke.js, and for the same reason: main.js takes
    // a single-instance lock, so an Electron tree that outlives this run makes
    // the NEXT app launch quit with no window and hang whatever waits for one.
    // The results are already printed, so a stalled teardown must never turn a
    // passing run into a hung one.
    const watchdog = setTimeout(() => process.exit(failed ? 1 : 0), 5000);
    watchdog.unref();
    const proc = app.process();
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
    if (proc && proc.pid) {
      // /T kills the whole tree — GPU, network and renderer are separate
      // processes and each holds the inherited stdout pipe open.
      try {
        require("child_process").execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch {
        /* already gone */
      }
    }
  }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
