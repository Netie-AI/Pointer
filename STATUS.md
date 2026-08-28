# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **PR #1 and #35 are on main.** Spoken-strip comma+please Word
   writes stay recipes. Closed #3 #8-#25 stay closed.
1. **DR-0005 (founder).** Screenshotable HUD, UACC READ, IBM Plex.
   Loopback MCP `computer.status` / `observe` / `act` / `scribe` /
   `meeting_assist` plus `/api/computer` `/api/observe` `/api/scribe`
   `/api/meeting`. Act/scribe fail-closed without Cortex. Transcribe
   types; Scribe rewrites then pastes. Hold Ctrl+Alt+Space. Double-tap
   keeps going (hands-free). Meeting
   Suggest/Recap/Follow-ups/Email/Actions. HUD lists 12 languages
   (English STT stays auto; Ctrl+Alt+L still English/Traditional Chinese).
   Teach LINE/PATH/BOX. `click window:` uses observed rects. Privacy
   and session chips. HUD Report a problem copies a local note (no
   cloud relay). `GET /api/meeting?pack=1` is one shareable pack.
   Dictation auto-stops at 120s. LIVE captions peek the open utterance
   (partials replace the tail; notes/scribe/commands stay final-only).
   `GET /api/observe?captions=1` is the same lines for agents.
   BYOK STT/LLM (keys stay OpenVault).
   P-04 parked.
2. **Generative tools + coworker desks (DR-0004 / DR-0005).** Coordinator
   `127.0.0.1:18010`. Public Worker is pages only; `/mcp` stays local.
   Meeting stack is Say this / Also / Don't say (never invent, never send).
   `/teach` is BOX walk + Got it Ask. `/workspace` This computer; Run
   refuses (P-06). Notes / Unsent mail / Needs you never Act. P-05 parked.
3. **EPIC-P04 and EPIC-P07 remain open.** No GPLv3 dump.

## Next

- Windows: `scripts/install_uacc.ps1` then prove UACC sees the HUD.
- Measure STT: `node scripts/stt_baseline.js`.
- `wrangler deploy` of `netie-host` when DNS/account is ready.

## Later

- OpenVault custody endpoint (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked (DR-0003). Third-party MCP servers stay P-05.
