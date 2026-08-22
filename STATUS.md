# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **CI is green on all three jobs** (run 32558187957) - the two-runner matrix
   earned its keep catching two Linux-only bugs (see CHANGELOG 2026-08-19).
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
   gate has a baseline to compare against, so it can actually fire (#16); and
   the smoke lane now runs in CI - a `windows-latest` job boots real Electron
   and runs both smoke suites (run 32558187957, all 25 assertions in the log),
   so #22's painted-geometry gate finally guards `main`.
3. **The status pill's Open button works** - the missing preload allowlist entry
   is fixed, and the class is pinned by `test/invariants/ipc-bridge.test.js`
   plus `test/smoke/ipc-live.smoke.js`, which drives the bridge in a booted app.
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
7. **Word coworker real-use leaked a test fixture.** Laptop
   `from-clipboard-1787382254896.docx` body is exactly `recovered selection`
   (`test/clipboard-integrity.test.js:121` on af25bb0). Uncontained test
   writes now refuse; suites must set `NETIE_WORD_OUT_DIR`. Closed #3 #10
   #11 #14 #17 stay closed.

## Next

- **Tickets #8-#25 and epics P01/P02/P03/P05/P06 stay closed** - this is a
  new real-use Word coworker defect, not a reopen. EPIC-P04 (OpenWillow vs
  TurboOCR) and EPIC-P07 (blocked cross-repo) remain open.
- Route the recall retention defect (Now item 1) through `prd-agent` - it fits
  no open epic, and it must not be lost now the wave is closed.
- Attachment follow-up: PDF and image attachments are refused by name today; a
  vision or extraction path is a PRD question, not a ticket - route to `prd-agent`.
- Do not merge PR #1 from this lane. Measure STT: `node scripts/stt_baseline.js`.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
