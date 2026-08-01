# Netie Clicks — wire contracts

The exact request/response shapes Netie Clicks speaks to its two peers. Verified against
Cortex `CortexOS/api/sidecar_routes.py` + `agent_routes.py` and OpenVault
`openmw/openvault/app.py` on 2026-07-26. Client implementation:
[`electron/netie/ecosystem.js`](../electron/netie/ecosystem.js).

## Endpoints & config

| Env var | Default | Meaning |
|---|---|---|
| `NETIE_OPENVAULT_URL` | `http://127.0.0.1:5000` | OpenVault base |
| `NETIE_CORTEX_URL` | `http://127.0.0.1:8010` | Cortex base |
| `NETIE_CORTEX_KEY` | *(empty)* | Scoped Cortex API key → sent as `Authorization: Bearer …`. Maps to a Cortex role (`viewer` for gate/classify/audit-read; `steward` for audit-append/agents). **Never a raw provider key.** |
| `NETIE_CLICK_MODEL` | `gpt-4o-mini` | Model name passed to OpenVault (must be a vision model in the pool) |
| `NETIE_CLICK_DEVICE` | `netie-clicks` | Audit actor / identity header |

All calls are **loopback only** (`127.0.0.1`). The panel CSP `connect-src` must list both origins.

## Cortex — security gate

`POST /dms/secure`  ·  role: `viewer`

```jsonc
// request
{ "text": "…untrusted screen text + user instruction…", "block_scam": true }
// response
{ "ok": true, "blocked": false, "text": "…PII-masked safe text…", /* +detector detail */ }
```

- `blocked: true` → **stop**. Do not send to any LLM, do not act. Show the reason.
- `text` is the masked/safe rendering — use it, not the raw input, downstream.
- **Fail rule:** unreachable Cortex ⇒ *fail-closed* for anything that leads to an action
  (`planActions`), *fail-open + degraded* for passive vision Q&A only. (`secure(..., {failClosed})`.)

## Cortex — intent classify (optional)

`POST /dms/classify`  ·  role: `viewer`  →  `{ "ok": true, …labels… }`. Advisory routing signal.

## Cortex — audit ledger

`POST /dms/audit/append`  ·  role: `steward`

```jsonc
{ "actor": "netie-clicks", "event_type": "clicks.plan", "payload": { "count": 3, "needsApproval": true } }
```

Hash-chained + tamper-evident (`/dms/audit/verify`). **Best-effort** from Clicks: an audit
outage must never block or silently enable an action — losses are detectable via verify.

Event types Clicks emits: `clicks.vision`, `clicks.plan`, `clicks.blocked`,
`clicks.action.executed`, `clicks.action.approved`, `clicks.action.rejected`, `clicks.custody.requested`.

Computer-use adds (C25-03): `clicks.cu.plan`, `clicks.cu.replan`, `clicks.cu.fallback`,
`clicks.skill.expand`, `clicks.vault.unresolved`.

## OpenVault — LLM (vision + planning)

`POST /v1/chat/completions`  ·  OpenAI shape  ·  header `x-openfree-identity: netie-clicks`

Standard `{ model, messages:[{role,content:[{type:"text"…},{type:"image_url",image_url:{url:dataURL}}]}], max_tokens }`.
OpenVault injects the real provider key from its custody/fallback chain — **Clicks sends none.**
Non-streaming only today (OpenVault returns 400 on `stream:true`).

## Cortex — computer-use planner (C25-01)

`POST /dms/agents/computer-use`  ·  role: `steward`  ·  **Cortex 2.5 — Pointer side shipped, engine side pending**

Pointer calls this when `NETIE_CU_PLANNER=1` (or `new NetieEcosystem({cuPlanner:true})`).
Implemented as `ecosystem.planViaCortex()`; `ecosystem._llmPlan()` is the fallback.
Contract tests against the mock peer: `test/contracts/computer-use.contract.js`.

Request:

```jsonc
{
  "device_id": "netie-clicks",
  "instruction": "…gated safeText, never raw screen text…",
  "hot_context": "skill preamble + brain/recall summary",
  "skills": ["form-fill"],                 // ids from /api/discovery/find-skills
  "screen": { "image_url": "data:image/png;base64,…",
              "region": { "x":0, "y":0, "width":1920, "height":1080 } },
  "policy": { "auto_run_sensible": true, "max_steps": 24 },
  "prior":  { "results": [], "replan_n": 0 }   // populated on replan rounds
}
```

Response:

```jsonc
{
  "ok": true,
  "plan_id": "cu_…",
  "actions": [ { "type":"fill", "target":"Email",
                 "value":"{{vault.profile.email}}", "xPct":42.1, "yPct":31.0 } ],
  "needs_approval": true,
  "rationale": "…",
  "skills_used": ["form-fill"]
}
```

Four rules Pointer enforces on the response, all covered by the contract tests:

0. **Only the fields listed above are read.** Planner output is projected onto a whitelist
   (`ecosystem.sanitizeModelAction`) before anything else touches it. The flags that decide
   whether a human is asked — `_approved`, `_requireConfirm`, `safety`, `_custody` — are set
   locally and are *not* accepted from the wire. A plan that arrives carrying `_approved:true`
   is a plan trying to approve itself, and on-screen text is enough to make a planner emit
   one, because the gate sanitises the instruction string and not the screenshot.
1. **`needs_approval:false` is advisory.** Local `reviewPlan` runs regardless and its
   verdict wins. Cortex cannot vote its own plan past the human.
2. **`{{vault.*}}` values are resolved locally** (`netie/vault-fill.js`) immediately before
   review. Cortex never receives and never returns the user's real data; an unresolved
   placeholder is blanked and forced to a human beat, never typed.
3. **Any failure falls back to `_llmPlan()` visibly** — `plan.planner` is
   `"cortex-cu"` or `"openvault-llm"`, `plan.plannerFallback` carries the reason, the
   HUD says so, and `clicks.cu.fallback` reaches the ledger. A silent brain swap is a lie.

Verbs are still filtered by `plan-guard` (`DRIVER_ACTIONS`), so the engine cannot introduce
an action the local driver does not implement.

### Replan (C25-03 · P13-03)

On step failure Pointer observes the run (`netie/replan.js`), re-captures the screen and
re-plans the remainder, at most **3 times per task**, carrying `prior.results` /
`prior.replan_n` back to Cortex. It never replans after the kill switch (`aborted`) or
after a gate refusal (`blocked`).

## Human-in-the-loop (local, mirrors Cortex approve/reject)

The Cortex `/dms/agents/*` `run → approve/reject` loop is the ecosystem's blessing for
*DMS watcher-agents*, not yet a computer-use planner. So Clicks implements the **same
approval semantics locally**: `planActions()` returns a reviewed plan; the UI must gate every
`disposition==="approve"` action behind a human OK before `executeApproved()` runs it, and
`audit()` each approve/reject. When Cortex ships a `/dms/agents/computer-use` planner, swap
`_llmPlan()` for it — the safety review and approval UI stay unchanged.

## Credential custody (never typed by the agent)

Any action whose target is a secret field (`disposition==="custody"` — password/card/OTP/…)
is **refused for auto-fill** and handed to OpenVault custody: the user approves in the vault
UI, the value is injected by the OS, and neither Clicks nor the LLM ever sees it. Event:
`clicks.custody.requested`. (Vault custody endpoint TBD with OpenVault — see FULL_PLAN week 2.)
