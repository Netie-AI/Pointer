"use strict";
/**
 * P3-UIA-TARGETING — UIA primary, vision fallback.
 *
 * Run: node test/acceptance/uia.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");

const uia = require("../../electron/netie/uia");
const { ensureActionCoords } = require("../../electron/netie/targeting");

const SCREEN = { x: 0, y: 0, width: 1000, height: 1000 };
const rect = (x, y, w, h) => ({ x, y, width: w, height: h });
const runWith = (candidates) => async () => JSON.stringify(candidates);

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("an exact control name wins", async () => {
      const found = await uia.findControl("Save", {
        run: runWith([
          { name: "Cancel", controlType: "Button", rect: rect(0, 0, 100, 40) },
          { name: "Save", controlType: "Button", rect: rect(200, 400, 100, 40) },
        ]),
        screen: SCREEN,
      });
      assert.strictEqual(found.via, "uia");
      assert.strictEqual(found.name, "Save");
      assert.strictEqual(found.xPct, 25); // (200 + 50) / 1000
      assert.strictEqual(found.yPct, 42); // (400 + 20) / 1000
    }),

    T("a button beats a label containing the same word", async () => {
      const found = await uia.findControl("Save", {
        run: runWith([
          { name: "Save", controlType: "Text", rect: rect(0, 0, 500, 500) },
          { name: "Save", controlType: "Button", rect: rect(600, 600, 80, 30) },
        ]),
        screen: SCREEN,
      });
      assert.strictEqual(found.name, "Save");
      assert.strictEqual(found.xPct, 64, "expected the button, not the label");
    }),

    T("the smaller control wins a tie — the button, not its pane", async () => {
      const best = uia.chooseCandidate("Submit", [
        { name: "Submit", controlType: "Button", rect: rect(0, 0, 900, 900) },
        { name: "Submit", controlType: "Button", rect: rect(100, 100, 90, 30) },
      ]);
      assert.strictEqual(best.candidate.rect.width, 90);
    }),

    T("Windows accelerators and casing do not defeat the match", async () => {
      assert.ok(uia.scoreCandidate("Save", { name: "&Save", controlType: "Button" }) >= 100);
      assert.ok(uia.scoreCandidate("sign in", { name: "Sign In", controlType: "Button" }) >= 100);
      assert.ok(uia.scoreCandidate("Sign in", { name: "Sign In button", controlType: "Button" }) >= 50);
      assert.strictEqual(uia.scoreCandidate("Save", { name: "Print", controlType: "Button" }), 0);
    }),

    T("the token-overlap branch can actually win", async () => {
      // It used to top out at 45, below the default minScore of 50, so the
      // entire branch was unreachable and any reordered or padded name fell
      // through to vision.
      const found = await uia.findControl("Sign in", {
        run: runWith([{ name: "In — Sign", controlType: "Button", rect: rect(100, 100, 80, 30) }]),
        screen: SCREEN,
      });
      assert.ok(found, "full token coverage must clear the default minScore");
      assert.strictEqual(found.via, "uia");
      // A single shared token out of three is still not a match.
      assert.ok(uia.scoreCandidate("open the invoice ledger", { name: "ledger", controlType: "Button" }) < 50);
    }),

    T("disabled and offscreen controls lose", async () => {
      const on = { name: "Save", controlType: "Button", rect: rect(0, 0, 10, 10) };
      assert.ok(
        uia.scoreCandidate("Save", { ...on, enabled: false }) < uia.scoreCandidate("Save", on)
      );
      assert.ok(
        uia.scoreCandidate("Save", { ...on, offscreen: true }) < uia.scoreCandidate("Save", on)
      );
    }),

    T("a control outside the capture region is not a target", async () => {
      assert.strictEqual(uia.rectToPct(rect(2000, 10, 10, 10), SCREEN), null);
      assert.strictEqual(uia.rectToPct(rect(10, 10, 10, 10), { x: 0, y: 0, width: 0, height: 0 }), null);
      const pct = uia.rectToPct(rect(1100, 100, 100, 100), { x: 1000, y: 0, width: 1000, height: 1000 });
      assert.strictEqual(pct.xPct, 15);
      const box = uia.rectToBoxPct(rect(200, 400, 100, 40), SCREEN);
      assert.strictEqual(box.leftPct, 20);
      assert.strictEqual(box.topPct, 40);
      assert.strictEqual(box.wPct, 10);
      assert.strictEqual(box.hPct, 4);
      assert.strictEqual(uia.rectToBoxPct(rect(2000, 10, 10, 10), SCREEN), null);
    }),

    T("PowerShell's single-result object is still a list", async () => {
      // ConvertTo-Json emits a bare object when there is exactly one match.
      const one = uia.parseProbeOutput('{"name":"Save","controlType":"Button","rect":{"x":0,"y":0,"width":10,"height":10}}');
      assert.strictEqual(one.length, 1);
      assert.deepStrictEqual(uia.parseProbeOutput(""), []);
      assert.deepStrictEqual(uia.parseProbeOutput("not json"), []);
    }),

    T("a label from a model cannot break out of the script", async () => {
      const script = uia.buildProbeScript("O'Brien'; Remove-Item C:\\ -Recurse #");
      assert.ok(script.includes("$want='O''Brien''; Remove-Item C:\\ -Recurse #'"), script.slice(0, 400));
      assert.strictEqual(uia.psLiteral("it's"), "'it''s'");
    }),

    T("listControls returns the tree and a failure is empty, not invented", async () => {
      const listed = await uia.listControls({
        run: runWith([
          { name: "Save", controlType: "Button", rect: rect(200, 400, 100, 40) },
          { name: "Cancel", controlType: "Button", rect: rect(0, 0, 100, 40) },
        ]),
      });
      assert.strictEqual(listed.length, 2);
      const failed = await uia.listControls({
        run: async () => {
          throw new Error("powershell timed out");
        },
      });
      assert.deepStrictEqual(failed, []);
      assert.deepStrictEqual(await uia.listControls({}), []);
    }),

    T("pointControls emits measured percents and never invents them", async () => {
      const points = uia.pointControls(
        [
          { name: "Cancel", controlType: "Button", rect: rect(0, 0, 100, 40) },
          { name: "Save", controlType: "Button", rect: rect(200, 400, 100, 40) },
          { name: "Hint", controlType: "Text", rect: rect(10, 10, 400, 400) },
          { name: "Gone", controlType: "Button", offscreen: true, rect: rect(10, 10, 10, 10) },
        ],
        SCREEN,
        { want: "Save" }
      );
      assert.strictEqual(points[0].name, "Save");
      assert.strictEqual(points[0].xPct, 25);
      assert.strictEqual(points[0].yPct, 42);
      assert.strictEqual(points[0].via, "uia");
      assert.ok(points[0].boxToken.includes("[BOX:20,40,10,4:1 Save]"));
      assert.strictEqual(points[0].leftPct, 20);
      assert.strictEqual(points[0].wPct, 10);
      assert.ok(points.every((p) => p.name !== "Gone"));
      const walk = uia.pointControls(
        [
          { name: "Cancel", controlType: "Button", rect: rect(0, 0, 100, 40) },
          { name: "Save", controlType: "Button", rect: rect(200, 400, 100, 40) },
        ],
        SCREEN
      );
      assert.strictEqual(walk[0].name, "Save");
      assert.strictEqual(walk[1].name, "Cancel");
      assert.strictEqual(uia.ctaRank("Save"), 0);
      assert.ok(uia.ctaRank("Cancel") > uia.ctaRank("Save"));
      assert.ok(points.length <= uia.MAX_TEACH_POINTS);
      assert.deepStrictEqual(uia.pointControls(null, SCREEN), []);
      assert.deepStrictEqual(uia.pointControls([{ name: "Save", controlType: "Button", rect: rect(0, 0, 10, 10) }], null), []);
    }),

    T("no confident match means no coordinates — vision gets its turn", async () => {
      const found = await uia.findControl("Save", {
        run: runWith([{ name: "Something else entirely", controlType: "Button", rect: rect(0, 0, 10, 10) }]),
        screen: SCREEN,
      });
      assert.strictEqual(found, null);
    }),

    T("a UIA failure never breaks targeting", async () => {
      const found = await uia.findControl("Save", {
        run: async () => {
          throw new Error("powershell timed out");
        },
        screen: SCREEN,
      });
      assert.strictEqual(found, null);
    }),

    // ── through targeting.js ────────────────────────────────────────────────
    T("PIPELINE: UIA answers first and vision is never called", async () => {
      let visionCalls = 0;
      const eco = {
        cfg: { openvaultUrl: "http://127.0.0.1:5000", model: "m", deviceId: "d" },
        _post: async () => {
          visionCalls += 1;
          return { text: async () => JSON.stringify({ choices: [{ message: { content: '{"xPct":9,"yPct":9}' } }] }) };
        },
      };
      const out = await ensureActionCoords(
        { type: "click", target: "Save" },
        {
          dataUrl: "data:image/png;base64,xx",
          eco,
          uia: { run: runWith([{ name: "Save", controlType: "Button", rect: rect(200, 400, 100, 40) }]), screen: SCREEN },
        }
      );
      assert.strictEqual(out._targetedVia, "uia");
      assert.strictEqual(out.xPct, 25);
      assert.strictEqual(visionCalls, 0, "UIA answered — the screen must not be sent anywhere");
    }),

    T("PIPELINE: UIA misses, vision takes over, and the plan says which", async () => {
      const eco = {
        cfg: { openvaultUrl: "http://127.0.0.1:5000", model: "m", deviceId: "d" },
        _post: async () => ({
          text: async () => JSON.stringify({ choices: [{ message: { content: '{"xPct":9,"yPct":11}' } }] }),
        }),
      };
      const out = await ensureActionCoords(
        { type: "click", target: "Custom canvas control" },
        {
          dataUrl: "data:image/png;base64,xx",
          eco,
          uia: { run: runWith([]), screen: SCREEN },
        }
      );
      assert.strictEqual(out._targetedVia, "vision");
      assert.strictEqual(out.xPct, 9);
      assert.strictEqual(out.yPct, 11);

      // …and the degradation has a consumer. `_targetedVia` asserted here but
      // read nowhere would make this test certify a report the product never
      // makes: "the OS told us" and "a model guessed" are different claims.
      const main = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
      assert.ok(main.includes("targetedVia"), "the audit ledger must record how the click was aimed");
      assert.ok(
        /_targetedVia === "vision"/.test(main),
        "a vision-aimed click must be visible to the user, not just to the tests"
      );
    }),

    T("PIPELINE: coordinates already on the action are left alone", async () => {
      const action = { type: "click", target: "Save", xPct: 1, yPct: 2 };
      const out = await ensureActionCoords(action, {
        dataUrl: null,
        eco: null,
        uia: { run: runWith([{ name: "Save", controlType: "Button", rect: rect(900, 900, 10, 10) }]), screen: SCREEN },
      });
      assert.strictEqual(out.xPct, 1);
      assert.strictEqual(out._targetedVia, undefined);
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
