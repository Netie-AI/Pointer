# Claude Code — Execution Pack (Pointer × Cortex 2.5)

Paste [`../prompts/CLAUDE_CODE_AGENTIC.md`](../prompts/CLAUDE_CODE_AGENTIC.md) into Claude Code.  
This file is the **spec**; that file is the **prompt**.

## Mission

Build and stress-test Pointer until it can **navigate by the real OS pointer**, execute **useful multi-step tasks**, act as a **screen agent** (Cluely-class live layer), and stay **heavily coordinated with Cortex** — driving toward Cortex 2.5 computer-use and onward.

Workspace: `D:\Netie Clicks` (rename to `D:\Pointer` via `scripts/rename-to-pointer.ps1` when Cursor is closed).

## Hard constraints

1. Loopback only (`127.0.0.1`). No cloud keys in Pointer.
2. Act path **fail-closed** on Cortex `/dms/secure`.
3. Pointer identity = **OS cursor swap** (`electron/netie/clicky/pointer.js`). Never re-add floating ring/orb/bubbles as the buddy.
4. Secrets → custody disposition; never LLM.
5. Keep CSP tight on `hud.html`.
6. Do **not** copy live API keys between Cortex `env.local` and OpenVault unless the human explicitly orders it in-chat.
7. Prefer TDD: make `npm run test:acceptance` green package-by-package.
8. After each package: `npm test && npm run test:stress && npm run test:e2e`.

## Baseline (must stay green)

```bash
npm test          # ~142 unit tests
npm run test:e2e  # golden act path (mocked peers)
npm run test:stress
```

## Work order (execute in sequence)

### Phase 0 — Ops unlock (human may need to help)

| WP | Task | Done when |
|----|------|-----------|
| OPS-OV-KEYS | Document OV key setup; do not copy keys unattended | README health check passes with keys **or** honest 503 note |
| OPS-RENAME | Run rename script if folder still `Netie Clicks` | Path is `D:\Pointer` |

### Phase 1 — Cluely HUD pass (one coherent PR)

| WP | Files | Acceptance test |
|----|-------|-----------------|
| HUD-01..06 | `hud.html`, `hud.css`, `hud.js`, `hud-audio.js`, `modes.js`, `main.js` | `test/acceptance/hud-live.test.js` |

Implement all six ACTIVE_PLAN HUD items in **one pass** — do not half-land.

### Phase 2 — Real-world usefulness

| WP | Implement | Acceptance |
|----|-----------|------------|
| P1-SKILLS-EXEC | `findSkills` hits → plan preamble / recipe expand in `hud:act` | `test/acceptance/skills-exec.test.js` |
| P1-VAULT-FILL | `profile.*` schema + `{{vault.*}}` resolve before execute | `test/acceptance/vault-fill.test.js` |
| P1-RECIPES-EXPAND | 5+ high-value SOPs (browser form, Excel, file save-as) | extend `test/recipes.test.js` |

### Phase 3 — Cortex 2.5 coordination

| WP | Implement | Acceptance |
|----|-----------|------------|
| P3-CU-PLANNER | `planViaCortex()` behind `NETIE_CU_PLANNER=1`; fallback `_llmPlan` | `test/contracts/computer-use.contract.js` |
| P3-REPLAN-LOOP | On step fail → observe → replan ≤3 | `test/acceptance/replan.test.js` |
| C25-DOC | Update `docs/CONTRACTS.md` with CU shapes from roadmap | doc diff |

### Phase 4 — Safety completeness

| WP | Implement | Acceptance |
|----|-----------|------------|
| P2-CUSTODY-INJECT | Soft-fail → continue when OV returns inject ok (mock + live) | `test/acceptance/custody.test.js` |
| P2-VERIFY-DEFAULT | Sensible default verify for irreversible / launch | `test/acceptance/verify.test.js` |
| P2-MEMORY-IMPORT | Importers under `electron/netie/import/` | `test/acceptance/memory-import.test.js` |

### Phase 5 — Perception + long horizon

| WP | Implement | Acceptance |
|----|-----------|------------|
| P3-UIA-TARGETING | UIA primary in `targeting.js` | `test/acceptance/uia.test.js` |
| P3-POINT-OVERLAY | Thin `[POINT…]` teach layer (no buddy orb) | visual + unit |
| P4-BG-AGENTS | Background job queue + HUD status | `test/acceptance/bg-agents.test.js` |

## Stress mandate (after Phase 2+)

`npm run test:stress` must cover:

1. **24-step plan** through guard + dry-run driver (no OS damage).
2. **Cortex down mid-plan** — no further LLM plan; abort clean; audit blocked.
3. **Recall daemon** — 5s cadence; no >15% simulated event-loop block in harness.
4. **Concurrent IPC flood** — 50 mock `hud:act` classifications serialized safely.
5. **Pointer travel** — 100 animated moves dry-run; last op coherent.
6. **Hallucinated verbs** — plan-guard drops all; never auto.
7. **Vault template injection** — unresolved `{{vault.x}}` never typed raw to OS.

## Mock peers

Use `test/harness/mock-peers.js`:

- Cortex: `/dms/secure`, `/dms/classify`, `/dms/audit/append`, `/api/discovery/find-skills`, `/dms/agents/computer-use`
- OpenVault: `/v1/chat/completions`, `/v1/custody/inject`

No live network in unit/stress/e2e. Optional `NETIE_LIVE=1` lane is separate and human-gated.

## Definition of done (this pack)

- [ ] All Phase 1–2 acceptance tests green
- [ ] `npm test` still green
- [ ] `npm run test:stress` green
- [ ] `npm run test:e2e` green
- [ ] `docs/CONTRACTS.md` updated for CU (even if feature-flagged off)
- [ ] `docs/ACTIVE_PLAN.md` checked off for completed WPs
- [ ] No floating Clicky chrome reintroduced
- [ ] Demo script: Clicky arm → pointer face → Do it → animated travel → audit event

## Out of scope for Claude Code unattended

- Copying provider keys between services
- Git force-push / rewriting history
- Enabling webcam nod without explicit ask
- Shipping installer / code signing
