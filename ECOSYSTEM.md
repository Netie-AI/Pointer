# Netie Clicks in the Netie Ecosystem

Netie Clicks is the **hands and eyes** of Netie — the easiest way for the machine to
*see* your screen and *act* on it. It is a thin, careful client. It holds no API keys,
trusts nothing it reads on screen, and never takes a consequential action without you.

## The four peers

```
            ┌─────────────────────────────────────────────────────────┐
            │                     Netie Ecosystem                      │
            │                                                          │
  you  ───► │  Netie Space   Netie Clicks     AirGPT        (front)    │
            │  (files/PDF)   (screen agent)   (chat driver)            │
            │        \            │             /                      │
            │         \           │            /                       │
            │      ┌───▼───────────▼───────────▼────┐                  │
            │      │           Cortex :8010          │  governed engine │
            │      │  /dms/secure  gate (injection/  │  = "Netie Engine"│
            │      │   PII/scam) · /dms/classify ·   │                  │
            │      │   /dms/audit/* tamper-evident   │                  │
            │      └───────────────┬─────────────────┘                  │
            │                      │                                    │
            │      ┌───────────────▼─────────────────┐                  │
            │      │         OpenVault :5000          │  custody + LLM   │
            │      │  /v1/chat/completions (OpenAI)   │  owns every key  │
            │      │  credential custody · providers  │                  │
            │      └─────────────────────────────────┘                  │
            └─────────────────────────────────────────────────────────┘
```

| Peer | Role | Netie Clicks uses it for |
|---|---|---|
| **OpenVault** `:5000` | Credential custody + OpenAI-shaped LLM proxy. **Owns every API key.** | Vision/help + action planning via `/v1/chat/completions`. Clicks never sees a provider key. |
| **Cortex** `:8010` | The governed "Netie Engine": pre-LLM security gate, intent classify, tamper-evident audit ledger, agentic runtime. | `/dms/secure` (gate untrusted screen text before any LLM), `/dms/classify`, `/dms/audit/*` (log every action). |
| **Netie Space** | File/PDF/media front door. | Sibling — shares the same Cortex+OpenVault backbone. No direct Clicks↔Space call today. |
| **AirGPT** | Chat driver (`:8765`). | Sibling. Future: Clicks can drop action summaries into an AirGPT RAG space. |

## What Netie Clicks *is*

- A tray app. **Ctrl+Space** arms a session; drag a region to crop; type an instruction
  ("what is this?", "click the green Save button", "fill the name field with Ada").
- **Sees** via `desktopCapturer`. **Remembers** the last 60s (hot ring) and action summaries (cold SQLite).
- **Answers** passively (vision Q&A) and **acts** only through the reviewed, approved path below.

## What Netie Clicks is **not**

- Not a key holder — OpenVault owns credentials.
- Not autonomous — nothing consequential runs without your explicit OK.
- Not trusting — text on screen is treated as **data, not commands** (it can be an attacker's
  billboard). It always goes through Cortex `/dms/secure` before reaching a model.

## The one golden path

Every screen-derived byte follows the same route (implemented in
[`electron/netie/ecosystem.js`](electron/netie/ecosystem.js), policy in
[`electron/netie/safety.js`](electron/netie/safety.js)):

```
capture ─► Cortex /dms/secure (gate) ─► [blocked? stop]
        └► OpenVault /v1/chat/completions (LLM, owns keys)
        └► safety.reviewPlan (classify each action)
        └► human approval for anything consequential
        └► execute locally (clicks/types)
        └► Cortex /dms/audit/append (tamper-evident log)
```

See [`docs/CONTRACTS.md`](docs/CONTRACTS.md) for the wire formats and
[`docs/SAFETY.md`](docs/SAFETY.md) for why each hop exists.
