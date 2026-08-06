# CHANGELOG

Append-only. Never edited, only added to. Newest first.

## 2026-08-07 - Governance gates, CI, and a .docx Word could not open

Tickets #12, #13, #14. Not closed - each needs a different run to verify (R-0003).

- **#12 the routing gate had a false negative.** `claude-contract.test.js` did
  `text.slice(hardIdx)`, which runs to end of file - so it asserted "prd-agent
  appears anywhere at or after the Hard rules heading", not "Hard rules contains
  the invariant". Latent only because Hard rules is currently last. The slice is
  now bounded at the next `##`, and the test carries the decoy case: a mutation
  that deletes the rule from Hard rules while leaving `prd-agent` in a later
  section. Executed both ways - old gate exit 0 (green with the rule deleted),
  bounded gate exit 1. The `None recorded yet` check, keyed to one old stub's
  exact wording, is replaced by a substance check.
- **#12 CI exists** (`.github/workflows/ci.yml`): invariant pack, unit, acceptance,
  e2e, contracts and stress, on windows-latest and ubuntu-latest - `safe-path.js`
  branches per platform, so one runner would leave half the containment logic
  unexercised. The strict acceptance flags are set via `env:` rather than the
  cmd-only `set VAR=` in `test:acceptance:strict`, which would have silently done
  nothing on Linux. A final step names what CI does NOT cover (the smoke lane
  needs a desktop session), because a gap nobody states is a gap nobody sees
  (R-0002).
- **#13 laptop-ASCII is now enforced** (`test/invariants/governed-docs.test.js`)
  across all five governed files, naming file, line, column and what to type
  instead. Nine violations fixed. `CHANGELOG.md` is in scope by decision: its one
  violation was an em dash in a heading, and replacing it preserves the entry's
  meaning exactly, so append-only is not broken - scoping the rule around one
  character would have left the largest governed file unenforced forever. The
  scanner proves itself against a planted violation (R-0007). `docs/ACTIVE.md`
  now tells a cold-start reader that `gh issue list` is the ticket source of truth.
- **#14 `writeDocx` produced documents Word refuses to open.** `xmlEscape` escaped
  `& < > "` but left the control characters XML 1.0 forbids - and terminal output,
  which `terminal_to_word` feeds it, carries ANSI escape sequences whose 0x1B
  introducer is one of them. It returned `ok: true` regardless, because the entire
  correctness assertion on the artifact was that the bytes start with `PK`.
  `stripXmlForbidden` removes exactly the forbidden characters and nothing else,
  so the visible remainder of an ANSI sequence still round-trips. The test now
  unzips the package with stdlib `zlib`, pulls `word/document.xml` back out and
  compares text across a seven-case corpus; `ipc-live.smoke.js` parses it with a
  real `DOMParser` in the booted renderer - the layer the customer receives it at
  (R-0001), and no parser dependency added.
- **#14 dry-run no longer touches disk** - `defaultDocxPath()` used to mkdir before
  the dryRun early return. The production dry-run path (no explicit `path`) had
  never been executed by any test; it is now, and asserts the directory tree is
  byte-for-byte unchanged.

Pack: `npm run test:agentic-pack` 426 assertions, `npm run test:smoke` 24.

## 2026-08-07 - The Open button never worked: IPC bridge completeness

- **`hud:openPath` was blocked at the preload** - `main.js` had the handler and
  `hud.js` made the call, but the channel was never added to the `INVOKE`
  allowlist in `hud-preload.js`, so every click on the status pill's Open button
  was rejected as a blocked channel. Three files have to agree for a HUD button
  to work and nothing checked that they did.
- **Fixed for the class** (R-0004): `test/invariants/ipc-bridge.test.js`
  cross-checks every channel the renderer invokes against both the preload
  allowlist and the `ipcMain.handle` table, in both directions. Verified it fails
  when the entry is removed (R-0007).
- **The Open button now reports refusals** instead of dismissing itself. It used
  to hide the pill unconditionally, so a containment refusal from #19 took the
  only surface that could report it (R-0011).
- **`test/smoke/ipc-live.smoke.js`** drives the real bridge in a booted app: every
  invoked channel survives the allowlist, `hud:openPath` refuses a `.bat` inside a
  sanctioned folder, a `.docx` outside every root, and `C:\Windows\System32\cmd.exe`;
  `hud:sttStatus` answers so hold-to-talk can gate on a real engine; cloud STT
  consent round-trips and defaults to off.
- Teardown: `ipc-live` kills its Electron tree like `hud-boot` does. `main.js` takes
  a single-instance lock, so a surviving tree makes the next launch quit windowless
  and hang the run.

- **The status pill was never driven by a run.** It shipped with an element, CSS
  and a renderer branch for `status` / `act-status`, and nothing in `main.js` ever
  sent one - so an Act run showed no progress at all, and the pill only appeared
  for a finished `.docx`. `executeApproved` now raises it on start, updates it per
  step using the same describer as the approval prompt (#20), and takes it down
  when the run ends. The bridge invariant now covers event types in both
  directions, with the stage window's deliberate drops (DR-0002 - the pointer is
  the identity) asserted as deliberate rather than assumed.

Whole pack green: `npm run test:agentic-pack` 419 assertions, plus `npm run
test:smoke` 23.

## 2026-08-06 - EPIC-P02 boundary, plus the P05/P06 gaps the sweep found

Adversarial sweep tickets #19-#25, implemented. Not closed: each needs a different
run to verify (KB R-0003).

- **Path containment** (`electron/netie/safe-path.js`) - one resolver for the class:
  resolves `..`, symlinks, 8.3 short names, Windows case, UNC and alternate data
  streams before comparing, so `C:\out-evil` no longer passes a prefix test against
  `C:\out`. Used by `word-coworker` (#15, write anywhere) and `hud:openPath` (#19,
  execute anything - `shell.openPath` runs `.exe/.bat/.ps1/.lnk`). Files need an
  extension allowlist and default to refuse; directories under a sanctioned root
  still open, so "Open in Explorer" keeps working (R-0005).
- **Approval disclosure** (`electron/netie/plan-describe.js`, #20) - `5 step(s) - nod
  or approve` is replaced by the verb and destination of every step. Secret values
  are never echoed; a write with no path does not invent one. A `word_*` action
  carrying an explicit destination can no longer resolve to `auto` under any policy.
- **Cloud STT consent** (#21) - `probe()` cached `deepgram-cloud` and short-circuited
  before re-reading consent, so revoking it kept uploading audio for the session.
  Consent is now re-checked on probe and again at the dispatch, and the resolved key
  is dropped on revoke. Proven RED first: the unfixed code uploads to Deepgram.
- **Attachments** (`electron/netie/attachments.js`, #23) - the chip used to be
  decoration; `input.value = ""` destroyed the FileList. Files are now held in
  renderer state keyed to their chip, read, and sent. Text formats inline; 256 KB per
  file, 512 KB total, 5 files; anything else is refused *at the chip* with a reason.
  Attached bytes are data, not commands: fenced, and an intent carrying attachments
  can never auto-run.
- **App recognition** (`electron/netie/app-target.js`, #24) - "put this in Notes" and
  "open it in Excel" matched nothing before. Confirmations now name the app, and an
  app Pointer cannot drive is named and refused instead of silently becoming some
  other plan.
- **Hold-to-talk** (#25) - the control was bound to nothing. The lifecycle lives in
  `hud-live.js`: blur, visibilitychange and pointercancel are hard stops, `end()` is
  idempotent, a watchdog closes a hold whose release never arrives, and a release
  during the engine probe cancels the hold. No engine means it says so rather than
  capturing audio that goes nowhere.
- **Chrome pinned against the rendered HUD** (#22) - `test/smoke/hud-boot.smoke.js`
  now drives the real DOM. Writing it found a defect no source grep could: the LIVE
  bar shipped with `hidden` set and rendered anyway, because `.subtitle-live` carries
  its own `display: flex`. Fixed for the class - `[hidden] { display: none }` - and
  the assertion reads painted geometry, never `el.hidden`.
- Verify lane: the three non-visual coworker verbs are classified as such and now
  assert artifact evidence (sha256 of the bytes on disk) instead of pixels.

## 2026-08-04 - Coworker Word API + Perplexity HUD chrome

- PRD-anchored: Hard rules require `prd-agent` before build; `test/invariants/claude-contract.test.js`.
- Safe Word path: `electron/netie/word-coworker.js`, driver `word_docx_write` / `word_from_clipboard`;
  `terminal_to_word` API-first; UI hotkey fallback + clipboard verify.
- HUD: hide LIVE bar; insights AI|Transcripts flip; status pill; command-bar attach/apps;
  onboard theme unlock; UI refs in `docs/ui-refs/perplexity-computer/`.
- Parked: VM coworker, share-anywhere, TurboOCR/OpenWillow wholesale (`PARKING_LOT.md`).
- Docs: `docs/ACTIVE.md` governance map, `docs/STT_OCR.md`, `docs/skills/word-paste-coworker.md`.
