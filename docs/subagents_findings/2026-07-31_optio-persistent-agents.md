---
keywords: [optio, persistent-agent, sticky, inbox]
main_idea: Optio PAs are service-model (turns, not jobs); continuity via inbox + workspace files — Pointer BG agents should use encrypted store, not plaintext MEMORY.md on disk.
---

# R2 — Optio persistent agents

- Lifecycle: idle → queued → running → halt (sticky / always-on / on-demand pods).
- Continuity: system prompt + drained inbox + `/workspace/` files (often MEMORY.md).
- **Map to Pointer:** `bg-agents.js` = sticky turns; wake sources = HUD / cron later; never leave PII in workspace markdown.
