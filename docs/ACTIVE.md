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
| HUD | `electron/hud.html`, `hud.js`, `hud.css` |
| Recipes / coworker SOPs | `electron/netie/recipes.js`, `coworker.js` |
| Coworker desks | `electron/netie/coworker-desks.js` (`teach` measured POINT plus Tab/Enter; loopback host sticky cue bar with a fixed Ask field plus `/teach` Back/Got it Ask the next step; `meeting` Heard names/orgs plus a You/Them talk track on `/meeting`; say-this reuses your overlapping line or Heard facts; `/meeting` `/today` `/workspace` Ask chips file inbox/Word/security drafts from the open file, never Act; This session links open `/workspace?id=` as the working set; inbox greets those names; Word notes titled from Heard; `today` plate is commitments only, not the say-this dump; meeting spawn files inbox+Word+security drafts, never Act) |
| UIA targeting | `electron/netie/uia.js` (Act targeting + teach POINT; no invented coords) |
| Artifact workspace | `electron/netie/workspace.js` (no runtime; public `/workspace` is a catalog; loopback home/workspace paint a This session file) |
| Skill search / craft hints | `electron/netie/skill-search.js`, `skills-exec.js` |
| Coordinator + first-party MCP ABI | `electron/netie/coordinator.js`, `mcp-abi.js`, `host-serve.js`; pages in `host/` (`/` `/today` `/meeting` `/teach` `/security` `/document` `/inbox` `/lanes` `/skills` `/workspace`); public Worker `workers/netie-host.js` |
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
| OpenVault | `:5000` | keys, chat completions fallback, STT |
