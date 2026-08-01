# Claude Code — Beat Realtime Pack (Pointer × Cortex)

Paste [`../prompts/CLAUDE_CODE_BEAT_REALTIME.md`](../prompts/CLAUDE_CODE_BEAT_REALTIME.md) into Claude Code.
This file is the **spec**; that file is the **prompt**.

## Mission

Make Windows Pointer usable like HeyClicky (liquid glass HUD + voice Act), keep **Gemini AI Studio first** via OpenVault, cloud models as backup, and harden Cortex so Netie beats GPT-Realtime-class demos on **governance + privacy** (not by streaming mic to OpenAI).

## Hard constraints

1. Fail-closed `/dms/secure` on **all** act paths (recipes + skills) — A-0007.
2. Whitelist planner fields; strip-then-grant `_approved` — A-0005.
3. `_custody` sticky — A-0006.
4. No provider keys in Pointer. Gemini primary; Anthropic/OpenAI backup.
5. No floating companion orb. OS cursor only.
6. Jot every finding to `docs/findings/` — chat is not memory.
7. Do not commit unless asked.

## Already green (do not rebuild)

Agentic phases 1–5 + adversarial critical/high fixes. Baseline: `npm run test:agentic-pack`.

## Work order

| Phase | WPs |
|-------|-----|
| 0 | Persist ADVERSARIAL_2026-07-31.md; FIX-C09/C15/C16/C17–C20 |
| 1 | MODEL_ROUTING.md; Gemini default model; HUD surfaces planner/model |
| 2 | Liquid glass HUD polish |
| 3 | Travel vault + enquire + privacy veil + form/air recipes |
| R | R1–R8 findings + MEMORY_DESIGN.md |
| C | C25-01 computer-use route; C-GEM-01; SkillCards; voice scaffold later |
| 4–5 | masked prefs; desktop verify checklist |

## Verify

```bash
npm run test:agentic-pack
```

Desktop (human): see `docs/DESKTOP_VERIFY.md`.
