"use strict";
/**
 * Screenshot the real HUD, out of a real Electron boot.
 *
 * Pointer ships `setContentProtection(true)` on every window (main.js
 * `applyContentProtection`). That is deliberate and stays: it is why the HUD
 * does not leak into a Teams share, and why the vision planner never plans
 * against a screenshot of itself. The cost is that it also blinds the person
 * building the thing — PrintScreen, desktopCapturer, and any OS-level capture
 * tool all come back with the HUD missing, so "what does this actually look
 * like" has had no answer that did not involve turning the protection off.
 *
 * Content protection is a DWM affinity flag on the OS window. It does not
 * reach the compositor, so a CDP capture — which is what Playwright's
 * `page.screenshot()` issues — still renders the frame. main.js already says
 * as much: "CapturePage still works for us". This harness is that sentence
 * made runnable.
 *
 * So: no setting is flipped, no default is weakened, and the shipped window is
 * exactly as protected during a shot as it is in front of a customer.
 *
 * The scenes drive the HUD through its own controls — clicking `#btn-more`,
 * not adding `.open` — so a shot certifies the path the customer takes. A
 * screenshot produced by hand-setting classes would look right while the
 * button underneath it was dead.
 *
 * Run:
 *   node scripts/hud-shot.js                      all scenes, dark
 *   node scripts/hud-shot.js --scene=chat         one scene
 *   node scripts/hud-shot.js --theme=light        one theme
 *   node scripts/hud-shot.js --themes=dark,light  a sweep
 *   node scripts/hud-shot.js --out=docs/shots     somewhere else
 *   node scripts/hud-shot.js --list               names only, boots nothing
 */

const path = require("path");
const os = require("os");
const fs = require("fs");
const { _electron: electron } = require("playwright");

const ROOT = path.join(__dirname, "..");
const DEFAULT_OUT = path.join(ROOT, "docs", "shots");
const THEMES = ["dark", "light", "gra", "computer"];

/* ── the desktop the glass is standing on ────────────────────────────────────
 * The HUD window is transparent, so a raw page capture is chrome floating on
 * checkerboard, and every `backdrop-filter` in hud.css has nothing to blur.
 * That does not just look unfinished, it is actively misleading: glass judged
 * against nothing reads as flat, and the contrast of --muted text against a
 * real wallpaper is the thing worth looking at.
 *
 * This layer is a harness artifact and is never part of the product. It sits
 * at z-index 0 behind every panel, and carries a corner watermark so a shot
 * can never be mistaken for a photograph of a running desktop.
 */
const BACKDROP = `
  #netie-shot-backdrop {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background:
      radial-gradient(1100px 620px at 18% 8%, #3a4d80 0%, rgba(58,77,128,0) 60%),
      radial-gradient(900px 700px at 86% 92%, #6d3f6a 0%, rgba(109,63,106,0) 62%),
      linear-gradient(155deg, #10131c 0%, #191d2b 46%, #0d1017 100%);
  }
  #netie-shot-backdrop::after {
    content: "harness backdrop - not the product";
    position: absolute; right: 12px; bottom: 10px;
    font: 600 10px/1 "Segoe UI", system-ui, sans-serif;
    letter-spacing: 0.06em; color: rgba(255,255,255,0.28);
  }
  .shot-light #netie-shot-backdrop {
    background:
      radial-gradient(1100px 620px at 18% 8%, #dbe4f6 0%, rgba(219,228,246,0) 60%),
      radial-gradient(900px 700px at 86% 92%, #f2dfe8 0%, rgba(242,223,232,0) 62%),
      linear-gradient(155deg, #eef1f7 0%, #e3e8f2 46%, #dfe4ee 100%);
  }
  .shot-light #netie-shot-backdrop::after { color: rgba(20,30,50,0.30); }
`;

/* ── scenes ──────────────────────────────────────────────────────────────────
 * Each `drive` runs inside the renderer and returns nothing. Anything it needs
 * to wait for is the harness's problem, not the scene's: `settle` covers the
 * 320ms panel transitions in hud.css with room to spare.
 */
const SCENES = [
  {
    name: "rest",
    about: "the HUD as it boots - top chrome, insights, empty chat dock",
    drive: () => {},
  },
  {
    name: "chat",
    about: "a real exchange in the AI response dock",
    drive: () => {
      const messages = document.getElementById("messages");
      messages.innerHTML = "";
      const add = (role, text) => {
        const el = document.createElement("div");
        el.className = "msg " + role;
        el.textContent = text;
        messages.appendChild(el);
      };
      add("user", "Summarize the invoice on screen and put the total in Word.");
      add(
        "assistant",
        "Invoice INV-4192, Meridian Supply, due 14 Oct. Subtotal 8,420.00, tax 505.20, " +
          "total 8,925.20.\n\nI can write that into a new Word document. Say the word and " +
          "I will ask Cortex to sign the step first."
      );
      document.getElementById("answer-meta").textContent = "Gemini 2.5 - 1.4s";
      document.getElementById("ask-input").value = "Yes, write it into Word";
    },
  },
  {
    name: "menu",
    about: "the settings menu open over the chrome",
    drive: () => document.getElementById("btn-more").click(),
  },
  {
    name: "status",
    about: "the fixed status pill after an artifact lands",
    drive: () => {
      window.__netieOnEvent({
        type: "word-docx",
        path: "C:\\Users\\demo\\Documents\\NetiePointer\\invoice-summary.docx",
        bytes: 8192,
      });
    },
  },
  {
    name: "roulette",
    about: "Retrieve roulette - chat, notes, assets, memory, source, fleet",
    drive: () => document.getElementById("btn-roulette").click(),
  },
  {
    name: "bug-report",
    about: "the persistent Report a problem form (#29)",
    drive: () => document.getElementById("bugReportBtn").click(),
  },
  {
    name: "enquire",
    about: "the missing-details form that parks a plan",
    drive: () => {
      const panel = document.getElementById("enquire-panel");
      const fields = document.getElementById("enquire-fields");
      fields.innerHTML = "";
      for (const [label, hint] of [
        ["Full name", "As it appears on the booking"],
        ["Work email", "you@company.com"],
        ["Phone", "+60 ..."],
      ]) {
        const wrap = document.createElement("label");
        wrap.className = "enquire-field";
        const span = document.createElement("span");
        span.textContent = label;
        const input = document.createElement("input");
        input.placeholder = hint;
        wrap.append(span, input);
        fields.appendChild(wrap);
      }
      panel.hidden = false;
    },
  },
  {
    name: "transcripts",
    about: "live captions in the insights panel, not a floating bar (#22)",
    drive: () => {
      [...document.querySelectorAll(".insight-tab")]
        .find((b) => b.dataset.insightView === "transcripts")
        .click();
      const lines = [
        "so the renewal lands on the fourteenth",
        "and finance wants the summary before that",
        "can you pull the totals off the invoice",
        "put them in a document I can send on",
        "and flag anything that moved since August",
      ];
      for (const text of lines) {
        window.__netieOnEvent({ type: "transcript", source: "system", text });
      }
    },
  },
];

function parseArgs(argv) {
  const out = { out: DEFAULT_OUT, scenes: null, themes: ["dark"], list: false, settle: 900 };
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key === "list") out.list = true;
    else if (key === "out") out.out = path.resolve(value);
    else if (key === "scene") out.scenes = value.split(",").filter(Boolean);
    else if (key === "theme" || key === "themes") out.themes = value.split(",").filter(Boolean);
    else if (key === "settle") out.settle = Number(value) || out.settle;
  }
  return out;
}

/** A theme the HUD does not have is a typo, and a typo should not shoot 8 files. */
function checkThemes(themes) {
  const bad = themes.filter((t) => !THEMES.includes(t));
  if (bad.length) throw new Error(`unknown theme(s): ${bad.join(", ")} - have ${THEMES.join(", ")}`);
}

function pickScenes(names) {
  if (!names) return SCENES;
  const known = new Map(SCENES.map((s) => [s.name, s]));
  const bad = names.filter((n) => !known.has(n));
  if (bad.length) {
    throw new Error(`unknown scene(s): ${bad.join(", ")} - have ${SCENES.map((s) => s.name).join(", ")}`);
  }
  return names.map((n) => known.get(n));
}

/**
 * Put the HUD back the way it booted.
 *
 * Scenes run one after another in a single boot, because booting Electron eight
 * times costs about a minute of nothing. That only works if a scene cannot leak
 * into the next one, so every panel a scene can open is closed here by name.
 */
async function reset(page) {
  await page.evaluate(() => {
    const hud = document.getElementById("hud");
    hud.className = "hud theme-dark mode-agent chat-open";
    document.getElementById("settings-menu").classList.remove("open");
    document.getElementById("roulette-panel").classList.remove("open");
    document.getElementById("enquire-panel").hidden = true;
    document.getElementById("bug-report-panel").hidden = true;
    document.getElementById("status-pill").classList.remove("show");
    document.getElementById("nod-toast").classList.remove("show");
    document.getElementById("ask-input").value = "";
    document.getElementById("answer-body").innerHTML = "";
    document.getElementById("answer-meta").textContent = "Ready";
    document.getElementById("transcript-feed").innerHTML = "";
    const tab = [...document.querySelectorAll(".insight-tab")].find(
      (b) => b.dataset.insightView === "ai"
    );
    if (tab) tab.click();
    document.getElementById("messages").innerHTML =
      '<div class="msg assistant">Speak or type. Transcribe arms the mic automatically. ' +
      "Drag this panel anywhere.</div>";
  });
}

/** One patient retry. The second attempt says so, so a slow run is legible. */
async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    stage(`retrying after ${(err && err.message ? err.message : err).split("\n")[0]}`);
    return fn();
  }
}

async function shoot(page, scene, theme, outDir, settle) {
  await reset(page);
  await page.evaluate(
    ({ themeName }) => {
      const hud = document.getElementById("hud");
      hud.classList.remove("theme-dark", "theme-light", "theme-gra", "theme-computer");
      hud.classList.add("theme-" + themeName);
      // The backdrop follows the HUD, so light chrome is judged on a light desk.
      // Judging the mint Computer theme against a near-black wallpaper would
      // flatter it: pale chrome always reads as crisp on dark.
      document.body.classList.toggle("shot-light", themeName === "light" || themeName === "computer");
    },
    { themeName: theme }
  );
  await page.evaluate(scene.drive);
  await page.waitForTimeout(settle);

  const file = path.join(outDir, `${scene.name}-${theme}.png`);
  stage(`capturing ${scene.name}-${theme}`);
  // Compositing a 1920x1140 transparent window in software - main.js disables
  // hardware acceleration on Windows - is slow, and on a laptop under memory
  // pressure it is slow enough that a first capture times out while a second
  // one, against the very same frame, returns in a second. Half a sweep came
  // back missing that way. Freezing animations removes the moving target, and
  // one patient retry covers the rest; a scene that fails twice is a real
  // failure and still fails the run.
  await withRetry(() => page.screenshot({ path: file, timeout: 60000, animations: "disabled" }));
  const { size } = fs.statSync(file);
  // A zero-byte or near-empty PNG means the capture went through but painted
  // nothing - which is exactly the failure content protection would cause if
  // it did reach the compositor. Say so here rather than shipping a blank.
  if (size < 4096) throw new Error(`${path.basename(file)} is ${size} bytes - the frame came back empty`);
  return { file, size, ...pngSize(file) };
}

/**
 * Width and height straight out of the PNG header.
 *
 * IHDR is always the first chunk, so the two big-endian uint32s at byte 16 are
 * the dimensions. Worth reading rather than trusting the viewport: a shot taken
 * before the window has been sized comes back 800x600 and looks plausible in a
 * file listing.
 */
function pngSize(file) {
  const head = Buffer.alloc(24);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, head, 0, 24, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (head.toString("ascii", 12, 16) !== "IHDR") return { width: 0, height: 0 };
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/**
 * What the window's protection was actually set from, during this run.
 *
 * The whole point of this harness is that it captures the HUD *without*
 * weakening anything, and a claim like that belongs in a file someone can
 * check, not in a comment. `captureVisible()` in main.js is the OR of exactly
 * two inputs, so both are read back here from the same places main.js reads
 * them - the process env, and the settings.json the app actually loads.
 *
 * `contentProtection: true` in the manifest means the shots next to it were
 * taken off a window the OS was still hiding from screen capture.
 */
function protectionState() {
  const envOn = process.env.NETIE_CAPTURE_VISIBLE === "1";
  let settingOn = false;
  let settingsFile = null;
  try {
    settingsFile = path.join(os.homedir(), "AppData", "Roaming", "NetieClicks", "settings.json");
    settingOn = JSON.parse(fs.readFileSync(settingsFile, "utf8")).captureVisible === true;
  } catch {
    // No settings file yet is the shipped default, which is `false`.
  }
  return {
    contentProtection: !(envOn || settingOn),
    from: { NETIE_CAPTURE_VISIBLE: envOn, "settings.captureVisible": settingOn },
    settingsFile,
  };
}

/**
 * Stage log.
 *
 * This harness boots Electron on a laptop that is regularly under 2 GB free,
 * where "slow" and "hung" look identical from the outside for minutes at a
 * time. Naming the stage costs one line and turns a silent stall into a fact.
 */
const stage = (msg) => process.stderr.write(`  .. ${msg}\n`);

async function shutdown(app, code) {
  // The shots are already on disk by the time we get here, so a teardown that
  // stalls must never turn a finished run into a hung one. Pointer is a tray
  // app: `window-all-closed` is preventDefault-ed on purpose, so `app.close()`
  // can sit there waiting for a quit that the product is designed never to do.
  const watchdog = setTimeout(() => process.exit(code), 5000);
  watchdog.unref();

  try {
    const proc = app && app.process();
    if (app) await Promise.race([app.close(), new Promise((r) => setTimeout(r, 3000))]);
    if (proc && proc.pid) {
      // /T takes the whole tree. The GPU, network and renderer children are
      // separate processes and each one holds the inherited stdout pipe open,
      // so leaving one behind leaves the calling shell blocked on a read.
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
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    for (const s of SCENES) console.log(`  ${s.name.padEnd(13)} ${s.about}`);
    console.log(`\n  themes: ${THEMES.join(", ")}`);
    return;
  }

  let scenes;
  try {
    checkThemes(args.themes);
    scenes = pickScenes(args.scenes);
  } catch (err) {
    console.error("hud-shot: " + err.message);
    process.exit(2);
    return;
  }

  fs.mkdirSync(args.out, { recursive: true });

  // A separate userData dir keeps this off the single-instance lock, so it does
  // not fight a Pointer the founder already has open, and cannot touch their
  // real settings, profile, or notes. Same reasoning as the boot smoke test.
  const profileDir = path.join(os.tmpdir(), `netie-shot-${process.pid}`);
  fs.mkdirSync(profileDir, { recursive: true });

  let app = null;
  try {
    stage("launching electron");
    app = await electron.launch({
      args: [path.join(ROOT, "electron", "main.js"), `--user-data-dir=${profileDir}`],
      cwd: ROOT,
      env: {
        ...process.env,
        // Boot the UI only: no STT child process, no key hunting, no plans.
        NETIE_STT_AUTOSTART: "0",
        NETIE_SMOKE: "1",
      },
    });

    stage("electron up - waiting for the HUD window");
    const page = await app.firstWindow({ timeout: 20000 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String((e && e.message) || e)));
    await page.waitForLoadState("domcontentloaded");
    stage("window attached - waiting for #hud");
    await page.waitForSelector("#hud", { timeout: 15000 });
    await page.waitForTimeout(1200); // let hud:ready settle
    stage("HUD rendered - injecting the harness backdrop");

    // hud.html ships `style-src 'self'`, so Playwright's addStyleTag - which
    // appends a literal <style> - is refused by the page's own CSP. That is the
    // policy working, and the harness has no business relaxing it. A constructed
    // stylesheet is CSSOM, not parsed markup, so it lands without a nonce and
    // without touching the meta tag the product ships.
    await page.evaluate((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      const el = document.createElement("div");
      el.id = "netie-shot-backdrop";
      document.body.prepend(el);
    }, BACKDROP);

    const protection = protectionState();
    console.log(`hud-shot: ${scenes.length} scene(s) x ${args.themes.length} theme(s) -> ${args.out}`);
    console.log(
      `  content protection during capture: ${protection.contentProtection ? "ON" : "OFF"}` +
        (protection.contentProtection ? "" : " - a setting is letting capture through, this run proves less")
    );

    const failed = [];
    const shots = [];
    for (const theme of args.themes) {
      for (const scene of scenes) {
        try {
          const shot = await shoot(page, scene, theme, args.out, args.settle);
          shots.push({
            scene: scene.name,
            theme,
            file: path.basename(shot.file),
            bytes: shot.size,
            width: shot.width,
            height: shot.height,
          });
          console.log(
            `  ok   ${path.basename(shot.file)}  ${(shot.size / 1024).toFixed(0)} KB  ` +
              `${shot.width}x${shot.height}`
          );
        } catch (err) {
          failed.push(`${scene.name}-${theme}`);
          console.log(`  FAIL ${scene.name}-${theme} - ${(err && err.message) || err}`);
        }
      }
    }

    // The manifest is what a gate can read. A directory of PNGs proves a file
    // was written; this says what was captured, at what size, and - the claim
    // that matters - whether the window was still protected while it happened.
    fs.writeFileSync(
      path.join(args.out, "manifest.json"),
      JSON.stringify(
        {
          takenAt: new Date().toISOString(),
          contentProtection: protection.contentProtection,
          protectionFrom: protection.from,
          rendererErrors: errors,
          failed,
          shots,
        },
        null,
        2
      ) + "\n"
    );

    // A renderer exception during a shot is why the shot looks wrong. Printing
    // it here saves the next person from diffing two PNGs to find a TypeError.
    if (errors.length) console.log(`\nrenderer errors: ${errors.join(" | ")}`);
    if (failed.length) console.log(`\n${failed.length} scene(s) failed: ${failed.join(", ")}`);
    await shutdown(app, failed.length || errors.length ? 1 : 0);
  } catch (err) {
    console.log("hud-shot: harness failed - " + ((err && err.message) || err));
    await shutdown(app, 1);
  }
})();
