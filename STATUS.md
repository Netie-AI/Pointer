# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **PR #1 and #35 are on main.** Spoken-strip comma+please Word
   writes stay recipes. Closed #3 #8-#25 stay closed.
1. **Generative tools, not a skill dump (DR-0004).** Act searches
   Cortex find-skills + local recipes, then crafts a hint draft
   (empty actions). First-party MCP ABI on loopback. Live
   coordinator at `127.0.0.1:18010` (`/` `/today` `/lanes` `/skills`).
   Public Worker `workers/netie-host.js` serves the same pages;
   `/mcp` and live lanes stay on the laptop. P-05 stays parked.
2. **EPIC-P04 and EPIC-P07 remain open.** Compute box is P-06.

## Next

- Recall HUD disclosure / PDF-image extraction are `prd-agent`.
- Measure STT: `node scripts/stt_baseline.js`.
- `wrangler deploy` of `netie-host` when DNS/account is ready.

## Later

- OpenVault custody endpoint (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked (DR-0003). P-05 stays parked.
