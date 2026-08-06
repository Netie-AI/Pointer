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
