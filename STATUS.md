# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **CI is green on both runners** - and it earned the matrix immediately, catching
   two Linux-only bugs Windows hid: `transcriber.js` conflated the Windows-speech
   policy flag with a platform capability check, and a `safe-path` assertion
   lowercased only one side of a comparison. Both fixed; run 31134651227 passes.
1. **Verified shipped privacy defect - recall persists, it does not expire.**
   `<dataDir>/recall/` holds 4177 sealed records (20 MB) on this machine: a
   foreground window-title timeline written every 5-15s, on by default, no HUD
   control, and nothing anywhere purges it. The "60s ring" bounds memory only -
   eviction calls `_sealEviction`, which writes to disk. No pixels by default.
   Independently verified (R-0003) against `docs/decisions/DR-0003`; it is the
   named prerequisite for any skill-harvesting work. NOT yet ticketed.
2. **Gates that can now fail** - CI exists (`.github/workflows/ci.yml`, two
   runners); the CLAUDE.md routing gate is bounded to its own section (#12); the
   five governed files are laptop-ASCII-enforced (#13); `.docx` output parses in
   a real XML parser and dry-run touches nothing (#14); the clipboard integrity
   gate has a baseline to compare against, so it can actually fire (#16).
3. **The status pill's Open button never worked** - `hud:openPath` had a handler
   and a caller but no preload allowlist entry, so every click was rejected as a
   blocked channel while the suite stayed green. Fixed, and the class is now
   pinned by `test/invariants/ipc-bridge.test.js` (renderer calls vs allowlist vs
   handlers, both directions) plus `test/smoke/ipc-live.smoke.js`, which drives
   the real bridge in a booted app.
4. **EPIC-P02 boundary implemented on branch** - one path resolver
   (`electron/netie/safe-path.js`) closes both #15 (write anywhere) and #19
   (`hud:openPath` executing anything). Approval now names the verb and the
   destination (#20) instead of a step count.
5. **P05/P06 gaps closed** - attachments actually attach (#23), app names are
   recognized and undrivable apps are refused by name (#24), hold-to-talk exists
   with blur/visibility/cancel as hard stops (#25). Cloud STT consent revoke now
   takes effect mid-session (#21).
6. **Chrome pinned against the rendered HUD** (#22) - writing it found the LIVE
   bar rendering despite `hidden`, because `.subtitle-live` set its own
   `display`. Fixed for the class; the assertion reads painted geometry.

## Next

- **#17 (append half of the .docx coworker) is the only sweep ticket not
  implemented.** It needs a zip READER, must preserve parts this module did not
  author or refuse clearly, and had to land after #14 - which it now can.
- **Verify #12-#25 on a different run, then close** - none are closed. KB R-0003:
  the run that wrote a fix does not verify it. `npm test`, `npm run
  test:acceptance` and `npm run test:smoke` are all green on this branch.
- Slice the rest of EPIC-P06 if the command bar needs more than these three.
- Attachment follow-up: PDF and image attachments are refused by name today; a
  vision or extraction path is a PRD question, not a ticket - route to `prd-agent`.
- Merge PR #1 or rebase (CI now exists, #12 done).
- Measure STT: `node scripts/stt_baseline.js` (see `docs/STT_OCR.md`).

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
