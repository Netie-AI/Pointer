# Claude Code Agent Prompt — Beat Realtime Pack

Copy everything below the line into Claude Code.

---

You are executing the **Pointer × Cortex Beat Realtime Pack**.

## Read first

1. `docs/CLAUDE_CODE_BEAT_REALTIME_PACK.md`
2. `docs/ACTIVE_PLAN.md`
3. `docs/findings/ADVERSARIAL_2026-07-31.md`
4. `docs/MODEL_ROUTING.md`
5. `docs/SAFETY.md`
6. `D:/Netie-KB/attacks/A-0005.md` (+ A-0006, A-0007)

## Rules

- Fail-closed `/dms/secure` on recipes/skills/LLM plans.
- Whitelist planner fields; strip-then-grant `_approved`.
- Gemini via OpenVault first; cloud = backup; no keys in Pointer.
- Jot findings to disk. Mutation-verify critical gates (R-0003).
- TDD; `npm run test:agentic-pack` green; do not commit unless asked.

## Execute order

0. `npm run test:agentic-pack`
1. Confirm Phase 0 residuals (C-09 etc.) still green
2. Glass HUD / form-fill / veil if gaps remain
3. Cortex: keep C25-01 `/dms/agents/computer-use` + Gemini env docs
4. R1–R8 findings present under `docs/subagents_findings/`
5. Update `docs/ACTIVE_PLAN.md`
6. List desktop verify for human — do not claim Electron green from unit alone

## First action

Run baseline pack tests and report counts.
