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
      assert.deepStrictEqual(out.points, [{ xPct: 42.1, yPct: 31, label: "Save" }]);
      assert.strictEqual(out.text, "Click Save to keep your work.");
    }),

    T("the label is optional", async () => {
      const out = po.parsePoints("Look here [POINT:10,20]");
      assert.deepStrictEqual(out.points, [{ xPct: 10, yPct: 20, label: "" }]);
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
      assert.deepStrictEqual(out.lines, []);
      assert.strictEqual(po.hasPoints("nothing here"), false);
      assert.strictEqual(po.hasPoints("[POINT:1,2:x]"), true);
      assert.deepStrictEqual(po.parsePoints(null), {
        text: "",
        points: [],
        lines: [],
        paths: [],
        boxes: [],
        dropped: 0,
      });
    }),

    T("LINE tokens draw a teach stroke without becoming a companion", async () => {
      const out = po.parsePoints("Go from [LINE:10,20,80,20:toolbar] then click.");
      assert.strictEqual(out.lines.length, 1);
      assert.strictEqual(out.lines[0].x1Pct, 10);
      assert.strictEqual(out.lines[0].x2Pct, 80);
      assert.strictEqual(out.lines[0].label, "toolbar");
      assert.ok(!out.text.includes("[LINE"));
      assert.strictEqual(po.hasPoints("[ARROW:0,0,10,10:here]"), true);
      const event = po.toOverlayEvent("[LINE:1,1,2,2]");
      assert.ok(Array.isArray(event.lines));
      assert.ok(Array.isArray(event.paths));
    }),

    T("PATH tokens draw a freehand stroke without becoming a companion", async () => {
      const out = po.parsePoints("Trace [PATH:10,20;30,40;50,20:loop] then click.");
      assert.strictEqual(out.paths.length, 1);
      assert.strictEqual(out.paths[0].points.length, 3);
      assert.strictEqual(out.paths[0].points[1].xPct, 30);
      assert.strictEqual(out.paths[0].label, "loop");
      assert.ok(!out.text.includes("[PATH"));
      assert.strictEqual(po.hasPoints("[PATH:1,1;2,2]"), true);
      const event = po.toOverlayEvent("[PATH:5,5;15,15]");
      assert.strictEqual(event.paths[0].points.length, 2);
      const hud = read("electron/hud.js");
      assert.ok(hud.includes("polyline"), "HUD must stroke PATH as a polyline");
      const css = read("electron/hud.css");
      assert.ok(/\.point-line polyline/.test(css), "PATH strokes stay in the click-through layer");
    }),

    T("BOX tokens frame a control without becoming a companion", async () => {
      const out = po.parsePoints("Click [BOX:10,20,30,12:Save] in the toolbar.");
      assert.strictEqual(out.boxes.length, 1);
      assert.strictEqual(out.boxes[0].xPct, 10);
      assert.strictEqual(out.boxes[0].yPct, 20);
      assert.strictEqual(out.boxes[0].wPct, 30);
      assert.strictEqual(out.boxes[0].hPct, 12);
      assert.strictEqual(out.boxes[0].label, "Save");
      assert.ok(!out.text.includes("[BOX"));
      assert.strictEqual(out.text, "Click Save in the toolbar.");
      assert.strictEqual(po.hasPoints("[BOX:10,20,30,12]"), true);
      assert.strictEqual(po.hasPoints("[RECT:10,20,30,12:Save]"), true);
      const zero = po.parsePoints("[BOX:10,20,0,12:Save]");
      assert.strictEqual(zero.boxes.length, 0);
      assert.strictEqual(zero.dropped, 1);
      const many = Array.from({ length: 10 }, (_, i) => `[BOX:${i},${i},8,8:b${i}]`).join(" ");
      const capped = po.parsePoints(many);
      assert.strictEqual(capped.boxes.length, po.MAX_BOXES);
      const event = po.toOverlayEvent("[BOX:5,5,20,10:OK]");
      assert.ok(Array.isArray(event.boxes));
      assert.strictEqual(event.boxes[0].label, "OK");
      const hud = read("electron/hud.js");
      assert.ok(/className = "point-box"/.test(hud), "HUD must draw BOX as a click-through frame");
      assert.ok(/event\.boxes/.test(hud), "point events must carry boxes");
      const css = read("electron/hud.css");
      const boxAt = css.indexOf(".point-box");
      const boxRule = boxAt >= 0 ? css.slice(boxAt, boxAt + 280) : "";
      assert.ok(/\.point-box/.test(css), "BOX frames stay in the click-through layer");
      assert.ok(!/backdrop-filter/.test(boxRule), "BOX must stay solid, not glass");
    }),

    T("the overlay event carries its own lifetime", async () => {
      const event = po.toOverlayEvent("[POINT:50,50:Here]", { ttlMs: 1200 });
      assert.strictEqual(event.type, "point");
      assert.strictEqual(event.ttlMs, 1200);
      assert.strictEqual(po.toOverlayEvent("[POINT:50,50]").ttlMs, po.DEFAULT_TTL_MS);
    }),

    T("raw tokens never reach the user's chat", async () => {
      const main = read("electron/main.js");
      assert.ok(main.includes("parsePoints"), "hud:ask must strip POINT tokens from the prose");
      const out = po.parsePoints("Press [POINT:5,5:OK] now");
      assert.ok(!out.text.includes("[POINT"), out.text);
    }),

    T("the overlay is not a companion and cannot eat clicks", async () => {
      const css = read("electron/hud.css");
      const html = read("electron/hud.html");
      assert.ok(html.includes('id="point-layer"'), "the layer must exist");
      assert.ok(
        /\.point-layer\s*\{[^}]*pointer-events:\s*none/.test(css),
        "the teach layer must never intercept the click it is pointing at"
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
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
