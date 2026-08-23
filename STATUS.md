# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **Punctuated write-in-Word is a recipe, not the clipboard stub.**
   "write hello in Word." / "put hello in word please" used to miss
   `word_docx_write` (tests had no trailing punct). hud:act skills/LLM
   now return the failed step; Plan finished does not overwrite a
   coworker refusal. Closed #3 #10 #11 #14 #17 stay closed.
1. **PR #30/#31/#32/#33 are on contracts.** Document ready re-raises
   after `done`; recall 60s expiry; unquoted write-in-Word;
   Go classifies Word coworker as act.
2. **Tickets #8-#25 and epics P01-P03/P05/P06 stay closed.** EPIC-P04
   and EPIC-P07 remain open.

## Next

- Recall HUD disclosure / off-by-default and PDF/image extraction are
  `prd-agent` questions.
- Do not merge PR #1. Do not attach work to PR #26.
- Measure STT: `node scripts/stt_baseline.js`.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked on Cortex authoring + EPIC-P08 disclosure.
- P-05 stays parked.
