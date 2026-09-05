# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **Unattended clicks have a record and a mandate.** `netie/ledger.js` is an
   append-only hash-chained local log; `eco.audit` writes it BEFORE Cortex, so
   a Cortex outage costs sync, not the record (it used to lose the event and
   say nothing). `netie/mandate.js` is a narrow expiring grant a human makes
   before the job; authority never rides on the action, so A-0005 stays shut.
   Payment and account-destruction are never coverable. 39 tests in the gate.
   Asks for phone-OTP and mail connectors are routed in `DR-0004`, not built.
1. **Punctuated write-in-Word hits the recipe, not the clipboard stub.**
   Failed steps surface; Plan finished never overwrites a coworker
   refusal. Closed #3 #10 #11 #14 #17 stay closed. (CHANGELOG 2026-08-23.)
2. **12 open PRs (#41-#57), every one CONFLICTING** (checked 2026-09-05).
   This, not missing capability, is what stands between here and a
   deliverable app. #30-#33 are long closed; this line used to claim
   otherwise.
3. **Tickets #8-#25 and epics P01-P03/P05/P06 stay closed.** EPIC-P04
   and EPIC-P07 remain open.
4. **HUD Report a problem** (#29) - persistent top-chrome `#bugReportBtn`;
   local copy-only form. Gate: `test/invariants/hud-bug-report.test.js`.
5. **The HUD can be screenshotted without unprotecting it.** `npm run shots`
   boots Electron under Playwright; CDP capture renders off the compositor,
   which the DWM affinity flag never reaches, so `setContentProtection(true)`
   stays ON during a shot. No launcher flag, no setting flip - both refused by
   `test/invariants/hud-shot.test.js`. Artifact gate: `npm run test:shots`.
6. **DR-0006 ratified 2026-09-05: mint/white Computer JOINS dark/light/gra.**
   Solid fills in that theme only; the other three keep their glass. IBM Plex
   vendored (OFL). Gate: `test/invariants/hud-surface.test.js`. The record is
   still only on `cursor/pointer-willow-rust-core-8217`, and the PRD ledger has
   no F29-F31 rows yet.
7. **The top chrome fits its own controls.** "Ask AI" / "Report a problem"
   wrapped to two lines; pills no longer wrap and the cap clears the measured
   1075px. Gated by a rendered box measurement, not by reading CSS.
8. **Folders completes DR-0006's command bar.** Attach and Folders share one
   `stageFiles`, so `netie/attachments.js` decides the ceilings once; a
   folder's refusals collapse into one counted chip. F18 (attachments
   discarded) is ALREADY FIXED in code - that ledger row predates #23.

## Next

- Recall HUD disclosure / off-by-default and PDF/image extraction are
  `prd-agent` questions.
- Do not merge PR #1. Do not attach work to PR #26. Do not close #29 here.
- Measure STT: `node scripts/stt_baseline.js`.
- `DR-0005` is used twice on main (coworker-desks, uacc-detectable-loopback).
  R-0013 forbids ID reuse; one needs renumbering. Not doable from this branch -
  neither record exists here.
- DR-0006 is ratified but still `status: proposed` on its own branch. Flipping
  it to `accepted` belongs to PR #57, whose surface half needs unbundling from
  its Rust-core / standing-home / UIA halves.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked on Cortex authoring + EPIC-P08 disclosure.
- P-05 stays parked.
