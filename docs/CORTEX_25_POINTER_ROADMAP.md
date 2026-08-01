# Cortex 2.5 → Pointer Agentic Roadmap

Status: **ACTIVE** · 2026-07-31  
Peers: Pointer (`D:\Netie Clicks` → `D:\Pointer`) · Cortex `:8010` · OpenVault `:5000`  
Handoff pack: [`CLAUDE_CODE_EXECUTION_PACK.md`](./CLAUDE_CODE_EXECUTION_PACK.md)  
Research: [gap map](e71f38b8-fcbf-497a-b0b0-81bc38be6e59)

## North star

Pointer is the **hands and eyes**. Cortex is the **governed brain**. OpenVault is **custody + LLM proxy**.

Evolve until Netie can:

1. **Navigate by pointer** — OS cursor IS Netie; animate travel; aim via UIA then vision.
2. **Do HeyClicky-class useful work** — form fill from vault, copy/paste SOPs, multi-app recipes, skills.
3. **Act as a Cluely-class screen agent** — live transcription, LIVE insights, meeting/general modes, always-on overlay without useless chrome.
4. **Stay fully agentic + coordinated** — Cortex gate → computer-use plan → local safety → human nod → driver → audit → replan.

```
User / LIVE speech
    │
    ▼
┌─────────────────┐     fail-closed      ┌──────────────────┐
│ Pointer HUD STT │ ───────────────────► │ Cortex /dms/*    │
│ Clicky pointer  │                      │ secure/classify  │
└────────┬────────┘                      │ audit / OSR      │
         │                               │ find-skills      │
         │                               │ computer-use ★   │
         ▼                               └────────┬─────────┘
┌─────────────────┐                               │
│ Recipes / Skills│ ◄──── skill YAML / SOPs ──────┘
│ plan-guard      │
│ safety review   │
└────────┬────────┘
         ▼
┌─────────────────┐     secrets only     ┌──────────────────┐
│ executeApproved │ ───────────────────► │ OpenVault custody│
│ driver animate  │                      │ + LLM fallback   │
│ UIA + vision aim│                      └──────────────────┘
└────────┬────────┘
         ▼
   audit + brain.remember + optional replan
```

★ = Cortex 2.5 deliverable (swap point already documented: `ecosystem._llmPlan()`).

---

## Release trains

### Pointer 1.1 — Cluely HUD + pointer identity (NOW → next session)

| ID | Deliverable | Acceptance |
|----|-------------|------------|
| HUD-01 | Centre record bar + LIVE subtitle (draggable) | Visual + `test/acceptance/hud-live.test.js` |
| HUD-02 | Auto-send countdown + cancel | Unit + manual |
| HUD-03 | Modes → General / Agent | `modes.js` + HUD pill |
| HUD-04 | Restart listen on Do it | `doAct` arms capture |
| HUD-05 | Live insights from speech | Debounced summary → insight panel |
| HUD-06 | Mic + system-audio → one LIVE line | `hud-audio.js` |
| PTR-01 | Pointer-only identity (no float ring) | **Done this session** |
| PTR-02 | Animated travel before aimed actions | **Done this session** |

### Cortex 2.5 — Computer-use + skills (Pointer 1.2)

| ID | Deliverable | Owner | Pointer hook |
|----|-------------|-------|--------------|
| C25-01 | `POST /dms/agents/computer-use` planner | Cortex | Replace `_llmPlan()`; keep `reviewPlan` + HUD approve |
| C25-02 | Skill catalog executable schema | Cortex | `findSkills` → plan preamble / recipe expand |
| C25-03 | Audit event types for CU steps | Cortex | `clicks.cu.plan`, `clicks.cu.step`, `clicks.cu.replan` |
| C25-04 | OSR novelty → skill suggest | Cortex | Already soft-calls `/api/engine/osr` |
| P12-01 | `ecosystem.planViaCortex()` | Pointer | Feature flag `NETIE_CU_PLANNER=1` |
| P12-02 | Skills exec (toast → actions) | Pointer | **WP-P1-SKILLS-EXEC** |
| P12-03 | Vault `profile.*` form fill | Pointer | **WP-P1-VAULT-FILL** |
| P12-04 | Contract tests vs CU schema | Pointer | `test/contracts/computer-use.contract.js` |

### Cortex 2.6 — Custody + verify + replan (Pointer 1.3)

| ID | Deliverable |
|----|-------------|
| C26-01 | OpenVault `/v1/custody/inject` live |
| P13-01 | Custody continue-plan after inject |
| P13-02 | Default-on post-step verify for irreversible |
| P13-03 | Observe→replan loop (max 3 replans / task) |
| P13-04 | Memory import (Cursor / Claude / ChatGPT exports) |

### Cortex 2.7 — UIA + long-horizon (Pointer 1.4)

| ID | Deliverable |
|----|-------------|
| P14-01 | UIA/a11y targeting primary; vision fallback |
| P14-02 | `[POINT:x,y:label]` teach overlay (thin, not a buddy) |
| P14-03 | Background agent jobs (status in HUD, not stage orb) |
| P14-04 | DXGI recall sidecar (NETIE_POINTER Phase 2) |

---

## Computer-use contract (Pointer ↔ Cortex 2.5)

Proposed request (Pointer → Cortex):

```jsonc
POST /dms/agents/computer-use
Authorization: Bearer <steward>
{
  "device_id": "netie-pointer",
  "instruction": "…gated safeText…",
  "hot_context": "…brain + recall summary…",
  "skills": ["form-fill", "excel-fill-right"],   // optional hints from find-skills
  "screen": { "image_url": "data:image/png;base64,…", "region": { "x":0,"y":0,"width":1920,"height":1080 } },
  "policy": { "auto_run_sensible": true, "max_steps": 24 },
  "prior": { "results": [], "replan_n": 0 }
}
```

Proposed response:

```jsonc
{
  "ok": true,
  "plan_id": "cu_…",
  "actions": [
    { "type": "click", "target": "Email", "xPct": 42.1, "yPct": 31.0, "skill": null },
    { "type": "fill", "target": "Email", "value": "{{vault.profile.email}}", "xPct": 42.1, "yPct": 31.0 }
  ],
  "needs_approval": true,
  "rationale": "…",
  "skills_used": ["form-fill"]
}
```

Pointer then: `guardPlan` → `reviewPlan` → vault resolve `{{vault.*}}` → `maybeRunPlan` → `executeApproved` → audit each step.

Until Cortex ships this, `_llmPlan()` remains the implementation behind the same return shape.

---

## Useful-task matrix (HeyClicky + Cluely parity)

| Task class | Mechanism | Train |
|------------|-----------|-------|
| Copy / paste / fill-right / undo / save | `recipes.js` | 1.1 |
| Terminal → Word / Claude → Cursor | `coworker.js` recipes | 1.1 |
| Fill form from vault profile | vault + fill skill | 1.2 |
| Ask about screen (passive) | `visionChat` fail-open | 1.1 (needs OV keys) |
| Multi-app click journey | plan-guard re-aim + animate | 1.1–1.2 |
| Meeting live notes | modes + LIVE | 1.1 |
| Password / OTP | custody inject | 1.3 |
| Long research / multi-step project | BG agents + Cortex CU | 1.4 |

---

## Non-goals (do not regress)

- Do **not** restore floating Clicky ring / stage orb / chat bubbles as identity.
- Do **not** put provider API keys in Pointer; OpenVault owns them.
- Do **not** auto-run `open`/`navigate` or irreversible verbs.
- Do **not** send secrets through the LLM.
- Do **not** weaken HUD CSP (`style-src 'self'`).
