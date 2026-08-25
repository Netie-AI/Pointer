# Claude Code Agent Prompt — Pointer × Cortex 2.5 Agentic Build

Copy everything below the line into Claude Code.

---

You are executing the **Pointer × Cortex 2.5 Agentic Pack** for Netie Pointer.

## Read first (in order)

1. `docs/CLAUDE_CODE_EXECUTION_PACK.md`
2. `docs/CORTEX_25_POINTER_ROADMAP.md`
3. `docs/ACTIVE_PLAN.md`
4. `docs/CONTRACTS.md`
5. `docs/SAFETY.md`
6. `docs/WIRING_HANDOFF.md`

## Goal

Make Pointer a real screen agent: **OS pointer navigation**, useful multi-app tasks (HeyClicky-class), live screen-agent UX (Cluely-class), **fully coordinated with Cortex**, ready to consume Cortex 2.5 `/dms/agents/computer-use` and keep building through 2.6/2.7.

## Rules

- Fail-closed act path via Cortex `/dms/secure`.
- Never put provider API keys in Pointer; OpenVault owns them.
- Never reintroduce floating Clicky ring / stage orb / bubbles as identity — cursor swap only.
- Never type secrets; custody disposition only.
- Do not copy live keys between Cortex and OpenVault unless I explicitly say so in this chat.
- TDD: turn `npm run test:acceptance` green package-by-package.
- After each package: `npm test && npm run test:e2e && npm run test:stress`.
- Match existing code style in `electron/netie/*` and `test/*.test.js` (assert + PASS/FAIL console, no jest required unless already present).
- Small focused diffs; no drive-by refactors; no unsolicited markdown outside docs already in the pack.

## Execute in this exact order

### A. Baseline
```bash
npm test
npm run test:e2e
npm run test:stress
```
Fix any breakage from prior work before new features.

### B. Phase 1 — HUD (HUD-01..06) in ONE pass
Centre record bar, draggable LIVE subtitle, auto-send countdown+cancel, General/Agent modes, restart listen on Do it, insights from speech, merge mic+system into LIVE.
Make `test/acceptance/hud-live.test.js` pass (extend the harness as needed for DOM-less checks of modes/helpers; keep Electron UI changes in `electron/hud.*`).

### C. Phase 2 — Usefulness
1. **Skills exec** — `findSkills` must change plans/recipes, not only toast. Green: `test/acceptance/skills-exec.test.js`
2. **Vault fill** — structured `profile.*` + `{{vault.*}}` resolution before `type`/`fill`. Green: `test/acceptance/vault-fill.test.js`
3. Expand recipes (≥5 real SOPs). Extend `test/recipes.test.js`.

### D. Phase 3 — Cortex 2.5 hook
Implement `planViaCortex()` (or equivalent) behind `NETIE_CU_PLANNER=1`, same downstream `reviewPlan`/`guardPlan`/`maybeRunPlan`. Fallback `_llmPlan`. Green: `test/contracts/computer-use.contract.js`. Update `docs/CONTRACTS.md`.

### E. Phase 4–5
Custody continue-plan, verify defaults, memory import, UIA targeting, thin POINT overlay, BG agents — per execution pack tables. One WP at a time; acceptance green before next.

### F. Stress harden
Extend `test/stress/*` if new failure modes appear. All stress scenarios in the pack must stay green.

## Deliverables when done

1. Passing suites: unit + e2e + stress + acceptance (for completed phases)
2. Short summary of what shipped vs deferred
3. Updated `docs/ACTIVE_PLAN.md` checkmarks
4. Do **not** commit unless I ask

## First action right now

Run baseline (`npm test && npm run test:e2e && npm run test:stress`), report counts, then start Phase 1 HUD pass.
