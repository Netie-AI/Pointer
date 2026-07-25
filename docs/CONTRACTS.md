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

## OpenVault — LLM (vision + planning)

`POST /v1/chat/completions`  ·  OpenAI shape  ·  header `x-openfree-identity: netie-clicks`

Standard `{ model, messages:[{role,content:[{type:"text"…},{type:"image_url",image_url:{url:dataURL}}]}], max_tokens }`.
OpenVault injects the real provider key from its custody/fallback chain — **Clicks sends none.**
Non-streaming only today (OpenVault returns 400 on `stream:true`).

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
