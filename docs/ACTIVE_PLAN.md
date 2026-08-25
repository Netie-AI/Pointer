# Pointer — Active Plan

Last updated: 2026-07-31 (Beat Realtime pack)  
Packs: [`CLAUDE_CODE_EXECUTION_PACK.md`](./CLAUDE_CODE_EXECUTION_PACK.md) · [`CLAUDE_CODE_BEAT_REALTIME_PACK.md`](./CLAUDE_CODE_BEAT_REALTIME_PACK.md)  
Prompt: [`../prompts/CLAUDE_CODE_BEAT_REALTIME.md`](../prompts/CLAUDE_CODE_BEAT_REALTIME.md)  
Findings: [`findings/ADVERSARIAL_2026-07-31.md`](./findings/ADVERSARIAL_2026-07-31.md) · Routing: [`MODEL_ROUTING.md`](./MODEL_ROUTING.md)

## Done

| Item | Status |
|------|--------|
| Agentic pack HUD-01..06 … P4-BG-AGENTS | green (strict acceptance) |
| Adversarial critical/high (A-0005, A-0006, abortPlan, custody thrash, keypress, shot-btn, …) | fixed + mutation tests |
| FIX-C09 recipe/skills `/dms/secure` (A-0007) | `secureBeforeAct` + `recipe-secure.test.js` |
| FIX-C15/C16 click-through + drag breakpoint | `hud.js` |
| Gemini-first default model + HUD planner surfacing | `ecosystem.js` / `MODEL_ROUTING.md` |
| Glass HUD blur/motion bump | `hud.css` |
| Travel vault + form/air recipes + privacy veil | vault-fill / recipes / privacy-veil |
| **Enquire, end to end** — panel, save, gated resume | `netie/enquire.js`, `hud.*`, `enquire.test.js` |
| **Arm-to-listen + glass acceptance** | `netie/capture-gate.js`, `privacy-hud.test.js` |
| R1–R8 findings + MEMORY_DESIGN | `docs/subagents_findings/` |
| C25-01 `/dms/agents/computer-use` scaffold | `CortexOS/api/sidecar_routes.py` |
| Cortex SkillCards form_fill / entity_clarify / adversarial_review | `D:\Cortex\skills\` |

### Enquire was half-built, and the row above used to claim otherwise

`prepareVaultPlan` emitted `{type:"enquire"}` and returned `needsEnquire`, and
`form-fill-privacy.test.js` asserted that missing keys drive the enquire list — but no
renderer consumed the event and no IPC channel existed to answer it. The plan stopped
with a message the user could not act on. That is the same defect the adversarial pass
confirmed twice (C-17 `toOverlayEvent`, C-19 `_targetedVia`): **a contract asserted in a
test with no consumer in the product.** Worth watching for as a recurring shape.

Now: `netie/enquire.js` (labels, secret refusal, keystroke sanitising) → a native `<form>`
panel in the HUD → `hud:enquireSave` → `settings.profile` → the parked plan resumes
*through* `secureBeforeAct` + `reviewPlan` + `maybeRunPlan`. Answering a form is not an
approval, and a resumed plan is not one that already passed the gate.

Three gates mutation-verified (each turns its suite red when removed): the secret
refusal, the disarmed-mic frame gate, and the resume-path Cortex gate.

## Run

```bash
npm run test:agentic-pack
```

## Immediate (human)

1. `GEMINI_API_KEY` in OpenVault (explicit)
2. Desktop verify: [`DESKTOP_VERIFY.md`](./DESKTOP_VERIFY.md)
3. Commit when asked
4. `git config --global --add safe.directory D:/Pointer` if git refuses the tree

## Next

| Train | Remaining |
|-------|-----------|
| Cortex | C-GEM-01 live provider_order; C-F8-01 screen tools; C-CFSM-01 wire gen-cFSM; C-VOICE-01 scaffold |
| Cortex 2.6 | OpenVault custody inject live |
| Pointer | DXGI recall sidecar; richer CU planner than observe-stub |

## Explicitly deferred

- Unattended API key copy
- Floating companion orb / always-on cloud mic
- mem0/Qdrant/Redis runtime
- Trained JEPA
