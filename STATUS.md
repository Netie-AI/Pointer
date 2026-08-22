# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **Recall sealed records expire.** Eviction still dual-wraps in-window
   frames, but time-expired frames are dropped and `<dataDir>/recall/` is
   swept of `recall-<t>-*.enc.json` older than `retentionMs` (default
   `windowMs` / 60s, hard cap 14 days). `test/clicky.test.js` fails if the
   sweep or the drop is removed. This is the DR-0003 fact-4 retention
   half - not skill harvest, not a HUD toggle.
1. **Tickets #8-#25 and epics P01/P02/P03/P05/P06 are closed** on
   `netie-ecosystem-contracts` - completeness re-derived from the code,
   closes cite pinning suites, the mutation pass, and CI run 32558187957.
   Only EPIC-P04 (founder engine choice) and EPIC-P07 (blocked cross-repo)
   remain open. PARKING_LOT P-05 stays parked.
2. **CI is green on all three jobs** (run 32558187957) - two-runner matrix
   plus smoke on windows-latest. Narrative is in CHANGELOG 2026-08-22.
3. **PR #1 stays open** - `netie-ecosystem-contracts` -> `main`. Do not
   merge from this lane.

## Next

- Recall HUD disclosure/control is still open; retention is not a toggle.
  Route to `prd-agent` before building it.
- Attachment follow-up (PDF/image) is a PRD question - route to `prd-agent`.
- Measure STT: `node scripts/stt_baseline.js` (see `docs/STT_OCR.md`).

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked on Cortex authoring + EPIC-P08 disclosure.
- P-05 stays parked.
