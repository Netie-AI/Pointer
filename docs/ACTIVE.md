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
| Coworker desks | `electron/netie/coworker-desks.js` (`teach` measured POINT plus Tab/Enter; loopback `/teach` walk path from measured BOX, current hold and later dashed; This screen paints field/button faces at those percents; freehand stroke stacks numbered boxes on the stage in display percents and keeps that polyline on the walk; laptop click-through overlay paints that walk on the display when HUD hides, with Click/Type in and field/button faces on the current BOX, tap current BOX is Got it, fixed Next / Then / Back / Got it Ask and Draw for a freehand stroke that stores a BOX plus the ink; sticky cue bar with a fixed Ask field plus `/teach` Back/Got it Ask; `meeting` Heard names/orgs plus a You/Them talk track and a Say this / Also / Don't say stack on `/meeting` and in HUD insight plus the live cue bar that stays when HUD chrome hides with last You/Them plus Live system captions, with a 300ms OpenVault refine that fails closed to the heuristic; loopback `/` paints that teach path, meeting card, Today plate, and filed desk windows from `/api/home`; open workspace files ground Heard facts only and label From the open file; say-this reuses your overlapping line or Heard facts; `/meeting` `/today` `/workspace` Ask chips file inbox/Word/security drafts from the open file, never Act; This session links open `/workspace?id=` as the working set; inbox greets those names and files To from Heard or not sent; Word notes titled from Heard; `today` plate is commitments only, not the say-this dump; meeting spawn files inbox+Word+security drafts, never Act) |
| UIA targeting | `electron/netie/uia.js` (Act targeting + teach POINT; no invented coords) |
| Artifact workspace | `electron/netie/workspace.js` (no runtime; public `/workspace` is a catalog with a This computer dock whose Run always refuses; loopback home/workspace paint a This session file; opening `live-document` / `live-inbox` / `live-security` offers generated `.docx` / unsent `.eml` / review.md; Download packet is `/api/session.zip` of those finished files; This session files are a desktop grid on This computer and tabs on the open file; opening live-teach paints This screen, live-meeting paints the Live answer, live-document paints Notes, live-inbox paints Unsent mail, live-security paints Needs you) |
| Skill search / craft hints | `electron/netie/skill-search.js`, `skills-exec.js` |
| Coordinator + first-party MCP ABI | `electron/netie/coordinator.js`, `mcp-abi.js`, `host-serve.js`; pages in `host/` (`/` `/today` `/meeting` `/teach` `/security` `/document` `/inbox` `/lanes` `/skills` `/workspace`); public Worker `workers/netie-host.js`; loopback host chrome paints Live captions from the meeting ring on `/meeting` and home, a Live answer card on `/meeting`, and Click/Type in on `/teach` (teach-only); `/document` downloads generated `.docx` and paints Notes; `/inbox` downloads generated `.eml` and paints Unsent mail (never send); `/security` downloads a generated review and paints Needs you (never approval); `/workspace?id=` offers the same finished files; Download packet is `/api/session.zip`; `/workspace` This computer paints those files as a desktop grid; home rail paints filed desk windows and a room dock; desks catalog stays on `/workspace`; public those paths 404 |
| UACC skills + loopback detect | `electron/netie/uacc.js`; MCP `computer.status` / `observe` / `act` (`click window: notepad` uses observed rects; HUD Ask uses the same local planner) / `scribe` / `meeting_assist`; loopback `/api/computer` `/api/observe` `/api/scribe` `/api/meeting` `/api/tools` on `127.0.0.1:18010`; observe windows include screen rects plus optional screenshot + clipboard; HUD `#privacy-chip` `#session-chip`; Copy recap / Copy say / Copy email / Copy actions from main |
| Dictation / Scribe | `electron/netie/dictate.js`, `scribe.js`, `delivery.js`, `holdkey.js`, `pending-scribe.js`; standing `scribeInstruction`; remembered-window screen capture; HUD `sttUrl` BYOK sidecar; recording/mode/language hotkeys; HUD 12-language list pins STT (English stays auto; Ctrl+Alt+L still English/Traditional Chinese) |
| Chat / LLM hop | `electron/netie/ecosystem.js`; HUD `llmUrl` / `llmModel` (blank = loopback OpenVault); custody stays on OpenVault |
| Meeting assist | `electron/netie/meeting.js`; HUD Suggest/Recap/Follow-ups/Email/Actions/Copy notes/Copy recap/Copy say/Copy email/Copy actions; Follow-ups chips; meeting LIVE captions (fixed chrome); `GET /api/meeting?notes=1` `?export=1` `?recap=1` `?say=1` `?email=1` `?actions=1` |
| Word safe API | `electron/netie/word-coworker.js` (`buildDocx` in memory; loopback `/document` downloads it; Word.app write still needs Cortex; public 404) |
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
