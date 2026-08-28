# Active map

What exists in this repo and where. Update when structure changes, not when state
changes - state lives in `STATUS.md`.

## Agent governance

| Stage | Who | Where |
|-------|-----|-------|
| Feedback intake | `prd-agent` | `D:\Netie\Software Blueprint\Pointer\PRD-001-...` ledger |
| Slice + tickets | `epic-agent` | GitHub Issues (`epic` / `ticket` labels) |
| Execute | `ticket-runner` | Issue body Agent prompt + acceptance |
| Contract | `CLAUDE.md` Hard rules | Must contain `prd-agent` routing invariant |

**Rule:** feature/defect -> prd-agent -> ledger -> epic tickets -> implement. Never skip.

**Tickets live in GitHub, not in this repo's markdown.** `gh issue list` in this repo is
the live source of truth for what is open, what is closed, and what each ticket's
acceptance says. No markdown file here is a backlog; if a document and an issue disagree,
the issue wins.

## Product surfaces

| Area | Path |
|------|------|
| Electron main / Act loop | `electron/main.js` |
| HUD | `electron/hud.html`, `hud.js`, `hud.css`; click-through POINT/LINE/PATH/BOX teach layer |
| Recipes / coworker SOPs | `electron/netie/recipes.js`, `coworker.js` |
| Skill search / craft hints | `electron/netie/skill-search.js`, `skills-exec.js` |
| Coordinator + first-party MCP ABI | `electron/netie/coordinator.js`, `mcp-abi.js`, `host-serve.js`; pages in `host/`; public Worker `workers/netie-host.js` |
| UACC skills + loopback detect | `electron/netie/uacc.js`; MCP `computer.status` / `observe` / `act` (`click window: notepad` uses observed rects; HUD Ask uses the same local planner) / `scribe` / `meeting_assist`; loopback `/api/computer` `/api/observe` `/api/scribe` `/api/meeting` `/api/tools` on `127.0.0.1:18010`; observe windows include screen rects plus optional screenshot + clipboard; HUD `#privacy-chip` `#session-chip`; Copy recap / Copy say / Copy email / Copy actions from main |
| Dictation / Scribe | `electron/netie/dictate.js`, `scribe.js`, `delivery.js`, `holdkey.js`, `pending-scribe.js`; standing `scribeInstruction`; remembered-window screen capture; HUD `sttUrl` BYOK sidecar; recording/mode/language hotkeys; HUD 12-language list pins STT (English stays auto; Ctrl+Alt+L still English/Traditional Chinese) |
| Chat / LLM hop | `electron/netie/ecosystem.js`; HUD `llmUrl` / `llmModel` (blank = loopback OpenVault); custody stays on OpenVault |
| Meeting assist | `electron/netie/meeting.js`; HUD Suggest/Recap/Follow-ups/Email/Actions/Copy notes/Copy recap/Copy say/Copy email/Copy actions; Follow-ups chips; meeting LIVE captions (fixed chrome); `GET /api/meeting?notes=1` `?export=1` `?recap=1` `?say=1` `?email=1` `?actions=1` |
| Word safe API | `electron/netie/word-coworker.js` |
| Driver (SendInput) | `electron/netie/driver.js` |
| Safety / plan-guard | `electron/netie/safety.js`, `plan-guard.js` |
| STT chain | `electron/netie/transcriber.js` |
| UI visual refs | `docs/ui-refs/perplexity-computer/INDEX.md` |
| Safety model | `docs/SAFETY.md` |
| Product surface | `docs/PRODUCT_SURFACE.md` |

## Cross-repo deps (Act path)

| Peer | Default | Role |
|------|---------|------|
| Cortex | `:8010` | `/dms/secure`, computer-use planner |
| OpenVault | `:5000` | keys, chat completions fallback, STT. HUD `llmUrl` may point chat elsewhere; custody stays here |
