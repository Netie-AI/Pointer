"use strict";
/**
 * P3-POINT-OVERLAY — a thin teach layer, and provably not a buddy.
 *
 * Run: node test/acceptance/point-overlay.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const po = require("../../electron/netie/point-overlay");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("a POINT token becomes a coordinate and leaves clean prose", async () => {
      const out = po.parsePoints("Click [POINT:42.1,31:Save] to keep your work.");
      assert.deepStrictEqual(out.points, [{ xPct: 42.1, yPct: 31, label: "Save", kind: "point" }]);
      assert.strictEqual(out.text, "Click Save to keep your work.");
    }),

    T("the label is optional", async () => {
      const out = po.parsePoints("Look here [POINT:10,20]");
      assert.deepStrictEqual(out.points, [{ xPct: 10, yPct: 20, label: "", kind: "point" }]);
      assert.strictEqual(out.text, "Look here");
    }),

    T("off-screen coordinates are dropped, the sentence survives", async () => {
      const out = po.parsePoints("Try [POINT:180,20:Save] and [POINT:-5,10:Cancel].");
      assert.deepStrictEqual(out.points, []);
      assert.strictEqual(out.dropped, 2);
      assert.strictEqual(out.text, "Try Save and Cancel.");
    }),

    T("a model cannot paint the screen with dots", async () => {
      const many = Array.from({ length: 30 }, (_, i) => `[POINT:${i},${i}:p${i}]`).join(" ");
      const out = po.parsePoints(many);
      assert.strictEqual(out.points.length, po.MAX_POINTS);
      assert.strictEqual(out.dropped, 30 - po.MAX_POINTS);
    }),

    T("text with no tokens is returned untouched", async () => {
      const out = po.parsePoints("Just an ordinary answer.");
      assert.strictEqual(out.text, "Just an ordinary answer.");
      assert.deepStrictEqual(out.points, []);
      assert.strictEqual(po.hasPoints("nothing here"), false);
      assert.strictEqual(po.hasPoints("[POINT:1,2:x]"), true);
      assert.deepStrictEqual(po.parsePoints(null), { text: "", points: [], dropped: 0 });
    }),

    T("the overlay event carries its own lifetime", async () => {
      const event = po.toOverlayEvent("[POINT:50,50:Here]", { ttlMs: 1200 });
      assert.strictEqual(event.type, "point");
      assert.strictEqual(event.ttlMs, 1200);
      assert.strictEqual(po.toOverlayEvent("[POINT:50,50]").ttlMs, po.DEFAULT_TTL_MS);
      const held = po.toOverlayEvent("[BOX:20,40,10,4:1 Save]", { hold: true });
      assert.strictEqual(held.hold, true);
      assert.strictEqual(held.ttlMs, 0);
      assert.strictEqual(held.points[0].kind, "box");
      const path = [
        { now: true, later: false, leftPct: 5, topPct: 8, wPct: 20, hPct: 3, label: "1 Email", stroke: [{ x: 5, y: 8 }, { x: 25, y: 11 }] },
        { now: false, later: true, leftPct: 20, topPct: 40, wPct: 10, hPct: 4, label: "2 Save", stroke: [{ x: 20, y: 40 }, { x: 30, y: 44 }] },
      ];
      const walked = po.toOverlayEvent("[BOX:5,8,20,3:1 Email]", { hold: true, path });
      assert.strictEqual(walked.hold, true);
      assert.ok(walked.points.some((p) => p.later && /Save/.test(p.label)));
      assert.ok(walked.points.some((p) => !p.later && !p.done && /Email/.test(p.label)));
      assert.ok(!walked.points.some((p) => p.later && /Email/.test(p.label)));
      assert.ok(walked.points.some((p) => p.later && Array.isArray(p.stroke) && p.stroke.length >= 2));
      assert.ok(walked.points.some((p) => !p.later && !p.done && Array.isArray(p.stroke) && p.stroke.length >= 2));
      const acted = po.toOverlayEvent("[BOX:5,8,20,3:1 Email]", {
        hold: true,
        cue: "1 of 2 Type in Email then Tab",
        path: [
          { now: true, cue: "Type in Email then Tab", key: "Tab", leftPct: 5, topPct: 8, wPct: 20, hPct: 3, label: "1 Email" },
          { now: false, later: true, leftPct: 20, topPct: 40, wPct: 10, hPct: 4, label: "2 Save" },
        ],
      });
      assert.ok(acted.points.some((p) => !p.later && !p.done && p.label === "Type in Email then Tab"));
      assert.ok(acted.points.some((p) => !p.later && !p.done && p.key === "Tab"));
      assert.ok(acted.points.some((p) => !p.later && !p.done && p.face === "field" && p.caption === "Email"));
      assert.ok(acted.points.some((p) => p.later && p.label === "2 Save"));
      assert.ok(acted.points.some((p) => p.later && p.face === "button" && p.caption === "Save"));
      assert.strictEqual(po.overlayActionLabel("1 of 3 Click Save or press Enter", ""), "Click Save or press Enter");
      assert.strictEqual(po.overlayControlFace("Type in Email then Tab"), "field");
      assert.strictEqual(po.overlayControlCaption("1 of 2 Type in Email then Tab"), "Email");
      assert.strictEqual(po.overlayControlFace("2 Save"), "button");
      assert.strictEqual(po.overlayControlCaption("2 Save"), "Save");
      assert.strictEqual(po.overlayControlFace("Look at region 1"), "region");
      assert.strictEqual(po.parsePoints("[BOX:5,8,20,3:1 Email]").points[0].label, "1 Email");
    }),

    T("raw tokens never reach the user's chat", async () => {
      const main = read("electron/main.js");
      assert.ok(main.includes("parsePoints"), "hud:ask must strip POINT tokens from the prose");
      const out = po.parsePoints("Press [POINT:5,5:OK] now");
      assert.ok(!out.text.includes("[POINT"), out.text);
    }),

    T("a BOX token becomes a measured highlight and leaves clean prose", async () => {
      const out = po.parsePoints("Aim [BOX:20,40,10,4:Save] now.");
      assert.strictEqual(out.points.length, 1);
      assert.strictEqual(out.points[0].kind, "box");
      assert.strictEqual(out.points[0].leftPct, 20);
      assert.strictEqual(out.points[0].topPct, 40);
      assert.strictEqual(out.points[0].wPct, 10);
      assert.strictEqual(out.points[0].hPct, 4);
      assert.strictEqual(out.points[0].xPct, 25);
      assert.strictEqual(out.points[0].yPct, 42);
      assert.strictEqual(out.text, "Aim Save now.");
      assert.strictEqual(po.hasPoints("[BOX:1,2,3,4:x]"), true);
    }),

    T("off-screen boxes are dropped", async () => {
      const out = po.parsePoints("Try [BOX:180,20,10,4:Save] and [BOX:-5,10,10,4:Cancel].");
      assert.deepStrictEqual(out.points, []);
      assert.strictEqual(out.dropped, 2);
    }),

    T("the overlay is not a companion and cannot eat clicks", async () => {
      const css = read("electron/hud.css");
      const html = read("electron/hud.html");
      assert.ok(html.includes('id="point-layer"'), "the layer must exist");
      assert.ok(
        /\.point-layer\s*\{[^}]*pointer-events:\s*none/.test(css),
        "the teach layer must never intercept the click it is pointing at"
      );
      assert.ok(
        /\.point-mark\.point-box[\s\S]{0,400}pointer-events:\s*none/.test(css),
        "a measured box must not eat the click it is highlighting"
      );
      // The floating Clicky chrome was removed on purpose — do not grow it back.
      assert.ok(
        !/id="clicky-orb"|class="clicky-orb"|stage-orb|chat-bubble/.test(html),
        "no floating companion may be reintroduced by this layer"
      );
      assert.ok(
        !/point-layer[^}]*chrome/.test(html.replace(/\n/g, " ")) ||
          !/class="[^"]*point-layer[^"]*chrome/.test(html),
        "the point layer must not be .chrome"
      );
      const walk = read("host/overlay.html");
      assert.ok(/pointer-events:\s*none/.test(walk), "the screen walk must not eat clicks");
      assert.ok(/id="walk-chrome"/.test(walk), "overlay keeps walk chrome");
      assert.ok(/id="walk-copy"/.test(walk) && /id="walk-acts"/.test(walk), "overlay walk chrome stacks cue lines instead of ellipsis");
      assert.ok(/#walk-cue, #walk-then, #walk-fill, #walk-filed/.test(walk) && /white-space:\s*normal/.test(walk), "overlay cue lines wrap");
      assert.ok(/id="walk-draw"/.test(walk) && />Draw</.test(walk), "overlay can stack a drawn BOX");
      assert.ok(/id="draw-stroke"/.test(walk), "overlay paints the freehand stroke");
      assert.ok(/id="walk-ink"/.test(walk), "overlay keeps stored freehand ink");
      assert.ok(/paintWalkInk/.test(walk), "stored ink is SVG, not innerHTML");
      assert.ok(/createElementNS/.test(walk), "stroke is SVG, not innerHTML");
      assert.ok(/teach-overlay:frame/.test(walk), "drawn overlay boxes POST a region, never Act");
      assert.ok(/id="walk-dock"/.test(walk) && /paintWalkDock/.test(walk) && /walk-filed/.test(walk), "overlay desk chips dock the filed file on the walk");
      assert.ok(/id="walk-desktop"/.test(walk) && /paintWalkDesktop/.test(walk) && /walk-win-inbox/.test(walk), "demo overlay is This computer under the walk");
      assert.ok(/html\.demo #walk-desktop/.test(walk) && /This computer - no runtime/.test(walk), "live Electron overlay stays transparent");
      assert.ok(/highlightWalkWindow/.test(walk), "desk chips highlight the filed window on This computer");
      assert.ok(/Unsent mail/.test(walk) && /not sent/.test(walk), "overlay mail dock is unsent");
      const openFn = walk.slice(walk.indexOf("function openDeskWindow"), walk.indexOf("function onDesk"));
      assert.ok(!/location\.href/.test(openFn) && !/window\.open/.test(openFn), "desk chips must not leave the overlay");
      assert.ok(/spoken \+ "\. Then "/.test(walk), "overlay speaks Then remaining");
      assert.ok(/Sarah Chen/.test(walk) && /Type " \+ fill/.test(walk), "overlay Email BOX types the Heard name");
      assert.ok(/onRailStep/.test(walk) && /data-rail/.test(walk) && /data-step/.test(walk), "overlay rail ticks jump by Ask");
      assert.ok(/spoken \+ "\. Last step"/.test(walk), "overlay speaks Last step on the last BOX");
      assert.ok(/Got it/.test(walk) && /data-q="got it, next"/.test(walk), "Got it Asks, never Acts");
      assert.ok(/Then:/.test(walk), "Then remaining stays on the overlay");
      assert.ok(/id="walk-rail"/.test(walk) && /walk-rail-tick/.test(walk), "overlay paints a remaining walk rail");
      assert.ok(/id="walk-chips"/.test(walk) && /Draft email/.test(walk), "overlay chips Ask the next desk");
      assert.ok(/overlayDeskHref/.test(walk) && /live-inbox/.test(walk), "overlay desk chips open fixed workspace ids");
      assert.ok(/data-desk/.test(walk), "desk chips are not teach advance");
      assert.ok(/ev.key === "Enter"/.test(walk), "Enter Asks Got it");
      assert.ok(!/Send mail|Approve/.test(walk), "overlay never sends or approves");
      assert.ok(/demoFrame/.test(walk) && /0\.4/.test(walk), "demo overlay Draw stacks a BOX with the 0.4% floor");
      assert.ok(/demoWalk.length >= 8/.test(walk), "demo overlay Draw caps at 8");
      assert.ok(/\\d\+\\s\+of\\s\+\\d\+/.test(walk), "overlay chrome strips N of M from the action");
      assert.ok(/i clicked/.test(walk), "demo click on the current BOX Asks, never Acts");
      assert.ok(/html\.demo, html\.demo body/.test(walk), "demo overlay can receive a click on the current BOX");
      assert.ok(/point-key/.test(walk), "current overlay box can show Tab/Enter");
      assert.ok(/point-face/.test(walk) && /\.point-face\.field/.test(walk), "overlay paints field faces at measured percents");
      assert.ok(/Type in Email/.test(walk) && /Click Save/.test(walk), "demo walk is Email then Save, not hollow regions");
      assert.ok(/teach-now-pulse/.test(walk) && /speechSynthesis/.test(walk), "overlay speaks Click/Type in and pulses the current BOX");
      assert.ok(/speakTeachCue/.test(walk), "overlay speak is teach-only");
      assert.ok(/if \(demo\) demoAdvance\(q\)/.test(walk), "demo overlay Got it advances without Electron");
      const hudJs = read("electron/hud.js");
      assert.ok(/point-face/.test(hudJs) && /overlayControlFace/.test(hudJs), "HUD paints the same control faces");
      assert.ok(/speakTeachCue/.test(hudJs) && /kind === "point"/.test(hudJs) && /Type " \+ nowFill/.test(hudJs), "HUD speaks Type Heard name on a field");
      const hudCss = read("electron/hud.css");
      assert.ok(/\.point-face\.field/.test(hudCss) && /\.point-face\.button/.test(hudCss), "HUD CSS paints field and button faces");
      assert.ok(/teach-now-pulse/.test(hudCss) && /\.point-mark\.point-box\.now/.test(hudCss), "HUD pulses the current BOX, not a cursor ring");
      assert.ok(!/innerHTML/.test(walk), "the walk paints with createElement");
      assert.ok(
        !/id="clicky-orb"|class="clicky-orb"|stage-orb|chat-bubble/.test(walk),
        "the screen walk is boxes, not a buddy"
      );
      const main = read("electron/main.js");
      assert.ok(main.includes("sendTeachOverlay"), "held BOX walks also paint on the display overlay");
      assert.ok(/host", "overlay.html"/.test(main), "Electron loads the host overlay page");
      assert.ok(/setIgnoreMouseEvents\(true/.test(main), "the display overlay is click-through");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
