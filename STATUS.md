# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **PR #1 and #35 are on main.** Spoken-strip comma+please Word
   writes stay recipes. Closed #3 #8-#25 stay closed.
1. **DR-0005 (founder).** Screenshotable HUD, UACC READ, IBM Plex.
   Loopback MCP `computer.status` / `observe` / `act` / `scribe` /
   `meeting_assist` plus `/api/computer` `/api/observe` `/api/scribe` /
   `/api/meeting`. Act/scribe fail-closed without Cortex. Transcribe
   types; Scribe rewrites then pastes. Hold Ctrl+Alt+Space. Double-tap
   keeps going (hands-free, 120s cap). Meeting
   Suggest/Recap/Follow-ups/Email/Actions. HUD lists 12 languages
   (English STT stays auto). Teach LINE/PATH/BOX. `click window:` uses
   observed rects. LIVE captions peek the open utterance. Agents read
   the same lines via `GET /api/observe?captions=1`.
   `computer.status.route` is Claude 5-hour vs Cursor. `use Claude`
   while that window is open; `use Cursor` when it is used. BYOK
   STT/LLM (keys stay OpenVault).
2. **Coworker desks + honest stack (DR-0004 / DR-0005).** Coordinator
   `127.0.0.1:18010`. Public Worker is pages only; `/mcp` stays local.
   Meeting is Say this / Also / Don't say. `/teach` is BOX walk + Got it
   Ask. Overlay/HUD/home Show me flies the BOX; Talk asks this BOX; HUD
   Draw pencils a BOX (Ask, never Act). Live answer is They asked / You /
   Say this / Also / Don't say. HUD cue bar docks that stack. Liquid
   glass on HUD/overlay/host with `@supports not` frost fallback.
   `/workspace` This computer; Run refuses (P-06). Never send.
3. **EPIC-P04 and EPIC-P07 remain open.** Packs: linux AppImage, win
   zip/portable, mac zip (`npm run pack:all`). Act is fail-closed off
   Windows. No GPLv3 dump. P-05 parked. Compute box is P-06.

## Next

- Windows: `scripts/install_uacc.ps1` then prove UACC sees the HUD.
- STT: `node scripts/stt_baseline.js`. `wrangler deploy` of `netie-host`
  when DNS/account is ready.

## Later

- OpenVault custody TBD. Skill harvest blocked (DR-0003). P-05 parked.
