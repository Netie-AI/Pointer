"use strict";
/**
 * Mandates — the only way a step runs with nobody watching.
 *
 * Every test here is a promise about what CANNOT happen unattended. The
 * self-approval cases are a standing regression pin for KB A-0005: authority
 * travels with the runner, never on the action.
 * Run: node test/mandate.test.js
 */

const assert = require("assert");
const {
  createMandateStore,
  describeMandate,
  GRANTABLE,
  DENY,
  MAX_TTL_MS,
  MAX_STEPS_CEILING,
} = require("../electron/netie/mandate");
const { DRIVER_ACTIONS } = require("../electron/netie/plan-guard");

let pass = 0;
const fails = [];
const tests = [];
const test = (n, f) => tests.push({ name: n, fn: f });

/** The ordinary grant most tests narrow from. */
function grantOutlook(store, over = {}) {
  const g = store.grant({
    reason: "clear my inbox",
    grantedBy: "hud-approval",
    apps: ["outlook"],
    verbs: ["click", "type", "scroll"],
    ...over,
  });
  assert.ok(g.ok, g.error);
  return g.id;
}

const IN_OUTLOOK = { app: "Outlook" };

test("every grantable verb is one the driver can actually run", () => {
  for (const verb of GRANTABLE) {
    assert.ok(DRIVER_ACTIONS.includes(verb), `mandate grants "${verb}" but the driver has no such verb`);
  }
  assert.ok(GRANTABLE.length > 5, "the filter must not have emptied the list");
});

test("launching apps and dragging are never grantable", () => {
  for (const verb of ["navigate", "open", "rightclick", "drag"]) {
    assert.ok(!GRANTABLE.includes(verb), `"${verb}" must not be unattendable`);
  }
});

test("a granted verb in a granted app is authorised, once per step", () => {
  const store = createMandateStore();
  const id = grantOutlook(store);
  const d = store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, true);
  assert.strictEqual(d.mandateId, id);
  assert.strictEqual(store.get(id).usedSteps, 1);
});

// ── KB A-0005: the action must never be able to grant itself anything ────────

test("an action carrying _approved is refused as tampering, not honoured", () => {
  const store = createMandateStore();
  const id = grantOutlook(store);
  const d = store.authorize(id, { type: "click", target: "Archive", _approved: true }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.TAMPERED);
});

test("an action naming its own mandate is refused, even when that mandate is real", () => {
  const store = createMandateStore();
  const id = grantOutlook(store);
  const d = store.authorize(id, { type: "click", target: "Archive", _mandateId: id }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, false, "a real id on the data is still data");
  assert.strictEqual(d.reason, DENY.TAMPERED);
});

test("a refused step costs no budget, so tampering cannot drain a mandate either", () => {
  const store = createMandateStore();
  const id = grantOutlook(store);
  for (let i = 0; i < 5; i += 1) {
    store.authorize(id, { type: "click", target: "Archive", _approved: true }, IN_OUTLOOK);
    store.authorize(id, { type: "click", target: "Archive" }, { app: "Chrome" });
  }
  assert.strictEqual(store.get(id).usedSteps, 0, "only authorised steps are spent");
});

test("a bound handle cannot be talked into naming a different mandate", () => {
  const store = createMandateStore();
  const outlook = grantOutlook(store);
  const chrome = store.grant({
    reason: "research", grantedBy: "hud-approval", apps: ["chrome"], verbs: ["click"],
  }).id;
  const handle = store.bind(outlook);
  assert.strictEqual(handle.id, outlook);
  const d = handle.authorize({ type: "click", target: "Archive" }, { app: "Chrome" });
  assert.strictEqual(d.allowed, false, "the handle is scoped to Outlook whatever the context says");
  assert.strictEqual(d.reason, DENY.APP);
  assert.strictEqual(store.get(chrome).usedSteps, 0);
});

// ── The mandate narrows; it never widens ────────────────────────────────────

test("a secret field stays custody's, however broad the grant", () => {
  const store = createMandateStore();
  const id = grantOutlook(store, { verbs: ["click", "type", "fill"], apps: ["outlook", "chrome"] });
  for (const target of ["Password", "One-time code", "CVV"]) {
    const d = store.authorize(id, { type: "fill", target, value: "x" }, IN_OUTLOOK);
    assert.strictEqual(d.allowed, false, `${target} must not be mandate-fillable`);
    assert.strictEqual(d.reason, DENY.TIER);
  }
});

test("paying and account destruction are never coverable, even if opted in by label", () => {
  const store = createMandateStore();
  const id = grantOutlook(store, {
    apps: ["chrome"],
    verbs: ["click"],
    allowIrreversible: ["buy now", "delete account", "confirm order"],
  });
  for (const target of ["Buy now", "Confirm order", "Delete account"]) {
    const d = store.authorize(id, { type: "click", target }, { app: "Chrome" });
    assert.strictEqual(d.allowed, false, `${target} must be refused unconditionally`);
    assert.strictEqual(d.reason, DENY.NEVER);
  }
});

test("an irreversible control needs its exact label opted in, not a category", () => {
  const store = createMandateStore();
  const id = grantOutlook(store, { verbs: ["click"], allowIrreversible: ["send"] });
  assert.strictEqual(store.authorize(id, { type: "click", target: "Send" }, IN_OUTLOOK).allowed, true);
  const other = store.authorize(id, { type: "click", target: "Publish" }, IN_OUTLOOK);
  assert.strictEqual(other.allowed, false, "one irreversible label does not license the rest");
  assert.strictEqual(other.reason, DENY.IRREVERSIBLE);
});

test("by default no irreversible step is covered at all", () => {
  const store = createMandateStore();
  const id = grantOutlook(store);
  const d = store.authorize(id, { type: "click", target: "Send" }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.IRREVERSIBLE);
});

test("a verb outside the grant is refused even though the driver supports it", () => {
  const store = createMandateStore();
  const id = grantOutlook(store, { verbs: ["click"] });
  const d = store.authorize(id, { type: "type", target: "Subject", value: "hi" }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.VERB);
});

test("an ungrantable verb is refused even when the grant asks for it", () => {
  const store = createMandateStore();
  const g = store.grant({
    reason: "browse", grantedBy: "hud-approval", apps: ["chrome"], verbs: ["navigate", "click"],
  });
  assert.ok(g.ok);
  assert.deepStrictEqual(store.get(g.id).verbs, ["click"], "navigate is filtered out of the grant itself");
  const d = store.authorize(g.id, { type: "navigate", target: "example.com" }, { app: "Chrome" });
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.VERB);
});

test("an action with no app context is refused - unattended means prove where you are", () => {
  const store = createMandateStore();
  const id = grantOutlook(store);
  const d = store.authorize(id, { type: "click", target: "Archive" }, {});
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.APP);
});

// ── A mandate is spent: steps, clock, revocation ────────────────────────────

test("the step budget is spent by the authorising call and then refuses", () => {
  const store = createMandateStore();
  const id = grantOutlook(store, { maxSteps: 3 });
  for (let i = 0; i < 3; i += 1) {
    assert.strictEqual(store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK).allowed, true);
  }
  const d = store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.EXHAUSTED);
});

test("a mandate expires on the clock, without anyone calling revoke", () => {
  let t = 1_000_000;
  const store = createMandateStore({ now: () => t });
  const id = grantOutlook(store, { ttlMs: 60_000 });
  assert.strictEqual(store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK).allowed, true);
  t += 60_001;
  const d = store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.EXPIRED);
  assert.deepStrictEqual(store.active(), [], "an expired grant is not shown as live");
});

test("revoke stops the next step immediately, and revokeAll clears the board", () => {
  const store = createMandateStore();
  const id = grantOutlook(store);
  assert.strictEqual(store.revoke(id).ok, true);
  assert.strictEqual(store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK).reason, DENY.REVOKED);
  grantOutlook(store);
  grantOutlook(store);
  assert.strictEqual(store.revokeAll(), 2);
  assert.deepStrictEqual(store.active(), []);
});

test("a mandate revoked at timestamp zero still refuses - no falsy-clock hole", () => {
  // Regression: `if (m.revokedAt)` reads 0 as "never revoked". With an injected
  // clock that is a live mandate the user believes they cancelled.
  const store = createMandateStore({ now: () => 0 });
  const id = grantOutlook(store);
  assert.strictEqual(store.revoke(id).ok, true);
  const d = store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK);
  assert.strictEqual(d.allowed, false);
  assert.strictEqual(d.reason, DENY.REVOKED);
  assert.strictEqual(store.revoke(id).ok, false, "and it cannot be revoked twice");
  assert.deepStrictEqual(store.active(), []);
});

test("an unknown mandate id grants nothing", () => {
  const store = createMandateStore();
  assert.strictEqual(store.authorize("m-nope", { type: "click", target: "x" }, IN_OUTLOOK).reason, DENY.NO_MANDATE);
  assert.strictEqual(store.bind("m-nope"), null);
});

// ── Grants cannot be minted carelessly ──────────────────────────────────────

test("a grant with no named human, no app, or no usable verb is refused", () => {
  const store = createMandateStore();
  assert.strictEqual(store.grant({ apps: ["outlook"], verbs: ["click"] }).ok, false);
  assert.strictEqual(store.grant({ grantedBy: "hud", verbs: ["click"] }).ok, false);
  assert.strictEqual(store.grant({ grantedBy: "hud", apps: ["outlook"], verbs: [] }).ok, false);
  assert.strictEqual(store.grant({ grantedBy: "hud", apps: ["outlook"], verbs: ["navigate"] }).ok, false);
});

test("ttl and step budget are clamped, so no grant becomes a standing licence", () => {
  const store = createMandateStore({ now: () => 0 });
  const id = grantOutlook(store, { ttlMs: 999 * 60 * 60 * 1000, maxSteps: 99999 });
  const m = store.get(id);
  assert.strictEqual(m.expiresAt, MAX_TTL_MS);
  assert.strictEqual(m.maxSteps, MAX_STEPS_CEILING);
});

test("every decision is announced, so the ledger and HUD can both see it", () => {
  const seen = [];
  const store = createMandateStore({ onEvent: (e, p) => seen.push([e, p && p.reason]) });
  const id = grantOutlook(store);
  store.authorize(id, { type: "click", target: "Archive" }, IN_OUTLOOK);
  store.authorize(id, { type: "click", target: "Send" }, IN_OUTLOOK);
  store.revoke(id);
  assert.deepStrictEqual(
    seen.map(([e]) => e),
    ["mandate.granted", "mandate.authorized", "mandate.denied", "mandate.revoked"]
  );
});

test("the HUD line says where, for how long, and how much is left", () => {
  const store = createMandateStore({ now: () => 0 });
  const id = grantOutlook(store, { ttlMs: 10 * 60 * 1000, maxSteps: 5, allowIrreversible: ["send"] });
  const line = describeMandate(store.get(id), 0);
  assert.match(line, /Acting in outlook/);
  assert.match(line, /10m/);
  assert.match(line, /5 steps left/);
  assert.match(line, /may confirm: send/);
  store.revoke(id);
  assert.match(describeMandate(store.get(id)), /revoked/);
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log("PASS " + name);
    } catch (err) {
      fails.push(name);
      console.log("FAIL " + name + " — " + err.message);
    }
  }
  console.log(`\nmandate: ${pass} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
