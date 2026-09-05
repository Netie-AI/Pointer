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
1. **Punctuated write-in-Word is a recipe, not the clipboard stub.**
   "write hello in Word." / "put hello in word please" used to miss
   `word_docx_write` (tests had no trailing punct). hud:act skills/LLM
   now return the failed step; Plan finished does not overwrite a
   coworker refusal. Closed #3 #10 #11 #14 #17 stay closed.
2. **PR #30/#31/#32/#33 are on contracts.** Document ready re-raises
   after `done`; recall 60s expiry; unquoted write-in-Word;
   Go classifies Word coworker as act.
3. **Tickets #8-#25 and epics P01-P03/P05/P06 stay closed.** EPIC-P04
   and EPIC-P07 remain open.
4. **HUD Report a problem** (#29) - persistent top-chrome `#bugReportBtn`;
   local copy-only form. Gate: `test/invariants/hud-bug-report.test.js`.

## Next

- Recall HUD disclosure / off-by-default and PDF/image extraction are
  `prd-agent` questions.
- Do not merge PR #1. Do not attach work to PR #26. Do not close #29 here.
- Measure STT: `node scripts/stt_baseline.js`.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked on Cortex authoring + EPIC-P08 disclosure.
- P-05 stays parked.
