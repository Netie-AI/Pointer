# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **PR #30 is on contracts.** Document ready re-raises after `done`;
   dry-run does not arm Open; refusals name `reason`.
1. **This merge lands PR #31 recall expiry + unquoted write-in-Word.**
   Time-expired evictions drop; `purgeExpired` sweeps `recall-<t>-*.enc.json`
   (default 60s, cap 14 days, clamp covers window fallback). Unquoted
   "write hello in Word" is `word_docx_write`; deictic this/that still
   copies. Closed #3 #10 #11 #14 #17 stay closed. Not PR #26. Not PR #1.
2. **Tickets #8-#25 and epics P01/P02/P03/P05/P06 stay closed.** EPIC-P04
   (founder engine choice) and EPIC-P07 (blocked cross-repo) remain open.

## Next

- Recall HUD disclosure / off-by-default and PDF/image extraction are
  `prd-agent` questions.
- Do not merge PR #1. Do not attach work to PR #26.
- Measure STT: `node scripts/stt_baseline.js`.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked on Cortex authoring + EPIC-P08 disclosure.
- P-05 stays parked.
