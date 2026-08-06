# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

1. **EPIC-P02 boundary implemented on branch** - one path resolver
   (`electron/netie/safe-path.js`) closes both #15 (write anywhere) and #19
   (`hud:openPath` executing anything). Approval now names the verb and the
   destination (#20) instead of a step count.
2. **P05/P06 gaps closed** - attachments actually attach (#23), app names are
   recognized and undrivable apps are refused by name (#24), hold-to-talk exists
   with blur/visibility/cancel as hard stops (#25). Cloud STT consent revoke now
   takes effect mid-session (#21).
3. **Chrome pinned against the rendered HUD** (#22) - writing it found the LIVE
   bar rendering despite `hidden`, because `.subtitle-live` set its own
   `display`. Fixed for the class; the assertion reads painted geometry.

## Next

- **Verify #19-#25 on a different run, then close** - none are closed. KB R-0003:
  the run that wrote a fix does not verify it. `npm test`, `npm run
  test:acceptance` and `npm run test:smoke` are all green on this branch.
- Slice the rest of EPIC-P06 if the command bar needs more than these three.
- Attachment follow-up: PDF and image attachments are refused by name today; a
  vision or extraction path is a PRD question, not a ticket - route to `prd-agent`.
- Merge PR #1 or rebase; add CI for `npm test` + the invariant pack (#12).
- Measure STT: `node scripts/stt_baseline.js` (see `docs/STT_OCR.md`).

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
