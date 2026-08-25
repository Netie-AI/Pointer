# Adversarial review — Pointer x Cortex 2.5 agentic build

**Date:** 2026-07-31  
**Workflow:** `pointer-agentic-adversarial-review` (5 find lenses + refute)  
**Totals:** `claimed: 37` · `refuted: 17` · `confirmed: 20`

> Chat is not durable memory. This file is the ledger.  
> KB attacks: [A-0005](file:///D:/Netie-KB/attacks/A-0005.md), [A-0006](file:///D:/Netie-KB/attacks/A-0006.md), [A-0007](file:///D:/Netie-KB/attacks/A-0007.md).

## Permanent rules (promote into SAFETY / Claude)

| Rule | Meaning |
|------|---------|
| **R-TEST-MECH** | A test that passes for an unrelated heuristic is a false green (e.g. target `"Password"` vs `_custody`). |
| **R-WHITELIST-PLAN** | Never filter-keep planner objects; project known fields only (`sanitizeModelAction`). |
| **R-STRIP-THEN-GRANT** | Never `{...a, _approved:true}` without `stripApproval` first. |
| **R-0011** | Degradation must be user-visible (HUD + ledger), including on **replan**. |
| **R-0003** | Author of code cannot be sole verifier for critical gates. |
| **R-SECURE-ALL-ACT** | Every path into `maybeRunPlan` / `executeApproved` must pass Cortex `/dms/secure` fail-closed — including recipes and skills. |

## Confirmed (20)

| # | Sev | Lens | File:line | Claim | Status | Fix / test |
|---|-----|------|-----------|-------|--------|------------|
| 1 | CRITICAL | safety-bypass | `electron/main.js` ~1297 | `_approved` arrives from planner JSON; plan can approve itself | **FIXED** | Whitelist + strip-then-grant; A-0005; `computer-use.contract.js` mutation |
| 2 | HIGH | safety-bypass | `electron/netie/safety.js` ~206 | `reviewPlan` overwrote `disposition:"custody"` from vault-fill | **FIXED** | `decide()` honours `_custody`; A-0006; vault-fill Recovery-words test |
| 3 | CRITICAL | planner-degradation | `electron/netie/ecosystem.js` ~572 | Planner output never field-sanitised; `_approved` survives | **FIXED** | Same class as #1 — `sanitizeModelAction` |
| 4 | HIGH | planner-degradation | `electron/main.js` ~2392 | Replan read `observation.aborted` not `abortPlan` | **FIXED** | `aborted: abortPlan \|\| observation.aborted`; replan.test.js |
| 5 | HIGH | planner-degradation | `electron/netie/replan.js` ~66 | Custody-pending counted as failure → re-request secret 3× | **FIXED** | custody/refused/mode-blocked not failures |
| 6 | MEDIUM | planner-degradation | `electron/main.js` ~2413 | Cortex outage on replan reported as "produced nothing" | **FIXED** | Surface real reason (R-0011) |
| 7 | MEDIUM | planner-degradation | `electron/main.js` ~2404 | CU→OV fallback invisible on replan | **FIXED** | HUD text on replan `plannerFallback` (~2480) |
| 8 | MEDIUM | planner-degradation | `electron/main.js` ~1459 | `_targetedVia` had no consumer | **FIXED** | HUD + audit `targetedVia` / vision toast |
| 9 | MEDIUM | planner-degradation | `electron/main.js` ~2265 | Recipe fast-path skips `/dms/secure` | **OPEN→FIX** | FIX-C09 in Beat Realtime pack; A-0007 |
| 10 | HIGH | correctness-edge | `electron/netie/verify.js` ~27 | `OBSERVABLE` omitted `keypress` | **FIXED** | OBSERVABLE synced; verify.test.js |
| 11 | MEDIUM | correctness-edge | `electron/netie/uia.js` ~58 | Token-overlap score capped below minScore | **FIXED** | Rescaled |
| 12 | MEDIUM | correctness-edge | `electron/netie/import/cursor.js` ~104 | Empty turn flipped export into N nodes | **FIXED** | `looksLikeTurn` on message list |
| 13 | HIGH | renderer-wiring | `electron/hud.html` ~134 | `#btn-shot` had no `.shot-btn` CSS | **FIXED** | `.shot-btn` bottom-right + morph-hidden |
| 14 | MEDIUM | renderer-wiring | `electron/hud.js` ~944 | `renderPoints` orphan wipe timer | **FIXED** | Both timers cancellable |
| 15 | MEDIUM | renderer-wiring | `electron/hud.js` ~181 | `setChatOpen(true)` forces `syncClickThrough(true)` | **OPEN→FIX** | FIX-C15 |
| 16 | LOW | renderer-wiring | `electron/hud.js` ~277 | Drag transforms fight `@media 900px` `-50%` | **OPEN→FIX** | FIX-C16 |
| 17 | LOW | renderer-wiring | `electron/main.js` ~2144 | `toOverlayEvent` unused; TTL dead | **FIXED** | `sendHud(toOverlayEvent(r.text))` on ask path |
| 18 | HIGH | test-quality | `test/acceptance/hud-live.test.js` ~246 | General-mode gate only regex at hud:act | **PARTIAL→FIX** | Gate at executeApproved; harden C-18 tests |
| 19 | MEDIUM | test-quality | `test/acceptance/uia.test.js` ~152 | Asserted internal `_targetedVia` only | **PARTIAL** | Now also asserts main.js HUD/audit consumers |
| 20 | LOW | test-quality | `test/acceptance/bg-agents.test.js` ~125 | Weak / truncated claim | **AUDIT** | Status publisher + describeQueue already asserted; strengthen if gap remains |

### Failure narratives (critical/high)

**[1]/[3] Self-approving plan.** Poisoned on-screen text → planner emits `_approved:true` on irreversible click → nod path refuses to grant on irreversible, but flag already true → executor runs Delete. Fix: project planner fields; strip-then-grant at all run-list builders.

**[2] Custody overwrite.** `resolveVaultTemplates` sets `_custody` + blank value; `reviewPlan` rebuilt `safety` from text heuristic; "Recovery words" missed word list → approve → empty type reported success. Fix: `_custody` can only add secrecy.

**[4] Kill-switch swallow.** Replan used derived abort sentinel; press after last step restarted loop. Fix: authoritative `abortPlan`.

**[5] Custody thrash.** Waiting on OpenVault counted as fail → up to 3 secret re-requests. Fix: pending custody is not a failure.

**[9] Recipe ungated.** `expandRecipe` → `reviewPlan` → `maybeRunPlan` with zero `/dms/secure`. Cortex down still ran desktop SOPs. Fix: fail-closed secure before recipe/skills act.

**[10] Unverified keypress.** Irreversible Enter never verified. Fix: add to OBSERVABLE.

**[13] Ghost Shot button.** UA-default button at (0,0) ate clicks / survived Hide. Fix: CSS rule.

**[18] Mode gate incomplete.** `clicks:approvePlan` bypassed hud:act check. Fix: gate in `executeApproved` (+ maybeRunPlan).

## Refuted (17)

The workflow return object was **not written to disk** (only the script under `.claude/projects/D--Pointer/.../workflows/scripts/`). Refuted claims are those where `verdict.refuted === true`. Reconstruct from lens empty-arrays + known false positives:

| Note | Likely class |
|------|----------------|
| R1–R4 | safety-bypass claims already prevented by plan-guard / reviewPlan / custody elsewhere |
| R5–R8 | planner claims unreachable without NETIE_CU_PLANNER or already surfaced |
| R9–R12 | correctness claims on null-safe paths / intentional bounds |
| R13–R15 | renderer claims on elements that do exist / CSS that already applied |
| R16–R17 | test-quality claims that were already mutation-capable or asserted product behaviour |

**Action:** next adversarial run must `return` AND `fs.writeFileSync` this ledger. Do not rely on chat.

## Mutation protocol used

For A-0005 and A-0006: revert fix → test red → restore → test green. Required for any future critical gate (R-0003).
