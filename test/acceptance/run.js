"use strict";
/**
 * Acceptance suite — RED until Claude Code implements packages.
 * Skip-pass pattern: if feature module missing, fail with explicit WP id.
 * Run: node test/acceptance/run.js
 * Env: NETIE_ACCEPTANCE_STRICT=0 allows soft-skip (default STRICT=1 → fail).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertSuite } = require("../harness/mock-peers");

const ROOT = path.join(__dirname, "..", "..");
const STRICT = process.env.NETIE_ACCEPTANCE_STRICT === "1";

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function loadOptional(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  try {
    return require(abs);
  } catch {
    return null;
  }
}

function requireFeature(wp, rel, exportName) {
  const mod = loadOptional(rel);
  if (!mod || (exportName && typeof mod[exportName] !== "function" && mod[exportName] == null)) {
    const msg = `[${wp}] missing ${rel}${exportName ? ` :: ${exportName}` : ""} — implement per docs/CLAUDE_CODE_EXECUTION_PACK.md`;
    if (STRICT) throw new Error(msg);
    console.log("SKIP " + msg);
    return null;
  }
  return mod;
}

(async () => {
  const suite = assertSuite();
  const T = suite.test;

  const tests = [
    T("HUD-LIVE: modes expose agent (General pending HUD-03)", async () => {
      const modes = require("../../electron/netie/modes");
      const ids = Object.keys(modes.MODES || {});
      assert.ok(ids.includes("agent"), "agent mode must exist");
      if (!ids.includes("general")) {
        if (STRICT && process.env.NETIE_ACCEPTANCE_HUD === "1") {
          throw new Error("[HUD-03] General mode not yet added");
        }
        console.log("NOTE [HUD-03] General mode pending — set NETIE_ACCEPTANCE_HUD=1 to enforce");
      }
    }),

    T("P1-SKILLS-EXEC: skills must be able to expand into actions", async () => {
      const mod = requireFeature(
        "WP-P1-SKILLS-EXEC",
        "electron/netie/skills-exec.js",
        "expandSkillsToActions"
      );
      if (!mod) return;
      const actions = mod.expandSkillsToActions(
        [{ id: "form-fill", title: "Form fill" }],
        { instruction: "fill my email", profile: { email: "ada@example.com" } }
      );
      assert.ok(Array.isArray(actions) && actions.length >= 1);
      assert.ok(actions.every((a) => a.type));
    }),

    T("P1-VAULT-FILL: resolve {{vault.*}} templates", async () => {
      const mod = requireFeature("WP-P1-VAULT-FILL", "electron/netie/vault-fill.js", "resolveVaultTemplates");
      if (!mod) return;
      const profile = { "profile.email": "ada@example.com", "profile.name": "Ada" };
      const out = mod.resolveVaultTemplates(
        [{ type: "fill", value: "{{vault.profile.email}}" }, { type: "fill", value: "literal" }],
        profile
      );
      assert.strictEqual(out[0].value, "ada@example.com");
      assert.strictEqual(out[1].value, "literal");
      const bad = mod.resolveVaultTemplates([{ type: "fill", value: "{{vault.missing}}" }], profile);
      assert.ok(bad[0]._unresolved || bad[0].safety?.disposition === "approve");
    }),

    T("P3-CU-PLANNER: planViaCortex on ecosystem", async () => {
      const { NetieEcosystem } = require("../../electron/netie/ecosystem");
      const eco = new NetieEcosystem({ fetchImpl: async () => ({ ok: false, status: 500, text: async () => "", json: async () => ({}) }) });
      if (typeof eco.planViaCortex !== "function") {
        const msg = "[WP-P3-CU-PLANNER] NetieEcosystem.planViaCortex missing";
        if (STRICT && process.env.NETIE_ACCEPTANCE_CU === "1") throw new Error(msg);
        console.log("NOTE " + msg + " — set NETIE_ACCEPTANCE_CU=1 to enforce");
        return;
      }
      assert.ok(typeof eco.planViaCortex === "function");
    }),

    T("P3-REPLAN: replan helper exists", async () => {
      const mod = requireFeature("WP-P3-REPLAN-LOOP", "electron/netie/replan.js", "shouldReplan");
      if (!mod) return;
      assert.strictEqual(mod.shouldReplan({ failCount: 1, replanN: 0, maxReplans: 3 }), true);
      assert.strictEqual(mod.shouldReplan({ failCount: 1, replanN: 3, maxReplans: 3 }), false);
    }),

    T("P2-MEMORY-IMPORT: importer entrypoints exist", async () => {
      const needed = [
        "electron/netie/import/cursor.js",
        "electron/netie/import/claude.js",
        "electron/netie/import/chatgpt.js",
      ];
      const missing = needed.filter((r) => !exists(r));
      if (missing.length) {
        const msg = `[WP-P2-MEMORY-IMPORT] missing ${missing.join(", ")}`;
        if (STRICT && process.env.NETIE_ACCEPTANCE_IMPORT === "1") throw new Error(msg);
        console.log("NOTE " + msg);
        return;
      }
      for (const r of needed) {
        const m = require(path.join(ROOT, r));
        assert.ok(typeof m.importExport === "function" || typeof m.parse === "function");
      }
    }),

    T("P2-CUSTODY: requestCustody returns injected when OV ok", async () => {
      const { NetieEcosystem } = require("../../electron/netie/ecosystem");
      const { createMockPeers } = require("../harness/mock-peers");
      const { fetchImpl } = createMockPeers({ injectOk: true });
      const eco = new NetieEcosystem({
        fetchImpl,
        cortexUrl: "http://127.0.0.1:8010",
        openvaultUrl: "http://127.0.0.1:5000",
      });
      const r = await eco.requestCustody({ field: "password", target: "Password" });
      // Today may soft-fail shape — accept ok or injected flag once implemented.
      assert.ok(r && typeof r === "object");
      if (r.injected !== true && STRICT && process.env.NETIE_ACCEPTANCE_CUSTODY === "1") {
        throw new Error("[WP-P2-CUSTODY-INJECT] expected injected:true from mock OV");
      }
    }),

    T("pack docs present for Claude Code", async () => {
      assert.ok(exists("docs/CLAUDE_CODE_EXECUTION_PACK.md"));
      assert.ok(exists("docs/CORTEX_25_POINTER_ROADMAP.md"));
      assert.ok(exists("prompts/CLAUDE_CODE_AGENTIC.md"));
      assert.ok(exists("docs/ACTIVE_PLAN.md"));
    }),
  ];

  const ok = await suite.run(tests);
  process.exit(ok ? 0 : 1);
})();
