# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **CI is green on all three jobs** (run 32558187957).
1. **Recall sealed-file expiry is PR #31**, not this branch. No other writer
   into `<dataDir>/recall/` was found. HUD off-by-default stays a prd-agent
   question. Do not attach work to PR #26.
2. **Word coworker residuals on this branch (includes #30).** Document ready
   is re-raised after `done`. Go/Act "write this in Word" is now a recipe,
   not ask/code/LLM click. Coworker refusals surface `reason` on the HUD
   instead of "failed: unknown". #27 fixture-sink refuse stays. Closed #3
   #10 #11 #14 #17 stay closed.
3. **Gates that can fail** - CI two-runner + smoke; CLAUDE.md routing (#12);
   laptop-ASCII governed files (#13); .docx XML parse (#14); clipboard
   integrity (#16); painted HUD geometry (#22).
4. **Open / #15 / #19 stay pinned** by `safe-path.js`, ipc-bridge, ipc-live.
5. **P05/P06 closed** - attachments (#23), app names (#24), hold-to-talk
   (#25), STT consent mid-session (#21).
6. **Tickets #8-#25 and epics P01/P02/P03/P05/P06 stay closed.** EPIC-P04
   (OpenWillow vs TurboOCR) and EPIC-P07 (blocked cross-repo) remain open.

## Next

- Recall HUD disclosure / off-by-default is a `prd-agent` question.
- Attachment PDF/image extraction is a PRD question.
- Do not merge PR #1 from this lane. Measure STT: `node scripts/stt_baseline.js`.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked on Cortex authoring + EPIC-P08 disclosure.
- P-05 stays parked.
