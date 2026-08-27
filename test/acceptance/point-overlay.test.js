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
        { now: true, later: false, leftPct: 5, topPct: 8, wPct: 20, hPct: 3, label: "1 Email" },
        { now: false, later: true, leftPct: 20, topPct: 40, wPct: 10, hPct: 4, label: "2 Save" },
      ];
      const walked = po.toOverlayEvent("[BOX:5,8,20,3:1 Email]", { hold: true, path });
      assert.strictEqual(walked.hold, true);
      assert.ok(walked.points.some((p) => p.later && /Save/.test(p.label)));
      assert.ok(walked.points.some((p) => !p.later && !p.done && /Email/.test(p.label)));
      assert.ok(!walked.points.some((p) => p.later && /Email/.test(p.label)));
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
      const walk = read("electron/teach-overlay.html");
      assert.ok(/pointer-events:\s*none/.test(walk), "the screen walk must not eat clicks");
      assert.ok(/id="walk-chrome"/.test(walk), "fixed overlay chrome advances the walk");
      assert.ok(/Got it/.test(walk) && /data-q="got it, next"/.test(walk), "Got it Asks, never Acts");
      assert.ok(/Then:/.test(walk), "Then remaining stays on the overlay");
      assert.ok(!/innerHTML/.test(walk), "the walk paints with createElement");
      assert.ok(
        !/id="clicky-orb"|class="clicky-orb"|stage-orb|chat-bubble/.test(walk),
        "the screen walk is boxes, not a buddy"
      );
      const main = read("electron/main.js");
      assert.ok(main.includes("sendTeachOverlay"), "held BOX walks also paint on the display overlay");
      assert.ok(/setIgnoreMouseEvents\(true/.test(main), "the display overlay is click-through");
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
