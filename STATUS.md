# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **PR #1 and #35 are on main.** Spoken-strip comma+please Word
   writes stay recipes. Closed #3 #8-#25 stay closed.
1. **DR-0005 (founder).** HUD is screenshotable by default (settings
   v3). UACC READ skills are in search + recipes. Loopback
   `GET /api/computer` and MCP `computer.status` / `computer.observe`
   make Pointer detectable. `computer.act` refuses without Cortex
   `/dms/secure`. IBM Plex HUD, no liquid glass. P-04 (OpenWillow
   wholesale) stays parked. P-05 act verbs stay parked.
2. **Generative tools (DR-0004).** Search then craft a hint. Coordinator
   at `127.0.0.1:18010`. Public Worker is pages only. P-06 parked.
3. **EPIC-P04 and EPIC-P07 remain open.**

## Next

- Windows: `scripts/install_uacc.ps1` then prove UACC sees the HUD.
- Port OpenWillow dictation/scribe patterns only (P-04).
- Measure STT: `node scripts/stt_baseline.js`.
- `wrangler deploy` of `netie-host` when DNS/account is ready.

## Later

- OpenVault custody endpoint (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked (DR-0003). `computer.act` waits on P-05.
