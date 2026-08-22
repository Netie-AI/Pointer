# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **Recall sealed records expire.** Time-expired evictions are dropped, not
   filed. `purgeExpired` unlinks `recall-<t>-*.enc.json` older than
   `retentionMs` (default `windowMs` / 60s, fail-closed, hard cap 14 days) on
   construct, trim, and `stopFlush`. In-window count-eviction still dual-wraps.
   Enforcer: `test/clicky.test.js`. DR-0003 fact-4 retention half. Not harvest.
   Not a HUD toggle. New unused branch - does not attach to PR #26.
1. **Word coworker real-use (#27) is on contracts.** Empty/whitespace writes
   refuse; Word-openable package; prose routes to `word_docx_write`; uncontained
   test writes refuse. Closed #3 #10 #11 #14 #17 stay closed.
2. **Document ready / Open after teardown is PR #30** (unused HUD branch, CI
   green). Not this PR.
3. **Tickets #8-#25 and epics P01/P02/P03/P05/P06 stay closed.** EPIC-P04
   (OpenWillow vs TurboOCR) and EPIC-P07 (blocked cross-repo) remain open.

## Next

- Recall HUD disclosure / off-by-default is a `prd-agent` question, not this
  change. Attachment PDF/image extraction is also a PRD question.
- Do not merge PR #1 from this lane. Do not attach work to PR #26.
- Measure STT: `node scripts/stt_baseline.js`.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked on Cortex authoring + EPIC-P08 disclosure.
- P-05 stays parked.
