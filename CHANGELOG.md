# CHANGELOG

Append-only. Never edited, only added to. Newest first.

## 2026-08-27 - Live observe, Esc cancel, Scribe screen, meeting Suggest

`GET /api/observe` plus MCP `computer.observe` now return the foreground
window and a titled-window list so other agents can see this computer.
`open:` and `focus hwnd:` plan locally. Esc cancels Transcribe/Scribe
listen without a lifetime global grab. Optional Scribe screen context
(off by default, OpenWillow-class). Meeting mode has a Suggest pill.
Teach overlay parses LINE/ARROW strokes. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Loopback scribe and meeting APIs for other agents

MCP `computer.scribe` and `computer.meeting_assist` plus
`POST /api/scribe` `/api/meeting` on `127.0.0.1:18010`. Same Cortex
`/dms/secure` fail-closed gate as `computer.act`. Public Worker still
404s those paths. Ctrl+Alt+M flips Transcribe/Scribe; Ctrl+Alt+L
flips English / Traditional Chinese. `deliver:` restores the
remembered hwnd then pastes. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Global dictation hotkey and meeting assist

Ctrl+Alt+Space snapshots the current app then toggles Transcribe
listen (Electron cannot true-hold a shortcut). HUD hold-to-talk
refreshes that target. Meeting mode Ask (empty = what should I say)
uses live notes as untrusted data. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Remembered-window delivery, Scribe mode, instruction plans

Dictation and Scribe restore the last non-Pointer window (focus_hwnd)
then type or paste. Scribe is a first-class HUD mode: copy selection,
rewrite through the Scribe prompt, paste. `computer.act` turns an
instruction into a recipe or type/click/observe plan after Cortex
`/dms/secure`. Writing style and personal notes are settings, not a
GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - Gated computer.act and OpenWillow dictation delivery

Loopback `computer.act` (MCP + `POST /api/computer`) now runs Cortex
`/dms/secure` then plan-guard then reviewPlan. Observe can auto-run.
Clicks still need `approved:true`. MCP execution ignores the HUD mode
pill so other agents can drive the desktop. Transcribe dictation types
mic speech into the focused app after a session gate. Scribe prompt
grounds rewrite requests. No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - UACC skills, screenshotable HUD, classy type (DR-0005)

Founder amendment. `captureVisible` defaults on and migrates existing
installs (settings v3) so UACC and other agents can see Pointer.
First-party UACC READ skill catalog + observe recipes. Loopback MCP
tools `computer.status` / `computer.observe` and `GET /api/computer`.
`computer.act` is on the allowlist and refuses without Cortex
`/dms/secure`. HUD drops `backdrop-filter` liquid glass for IBM Plex
Serif + Sans solid panels. Windows install: `scripts/install_uacc.ps1`.
Does not bundle OpenWillow (P-04). Does not load third-party MCP
servers. P-05 coworker verbs stay parked.

Dictation mode aliases transcribe. "rewrite this" / "scribe this"
copies the selection (OpenWillow Scribe pattern, no GPLv3 dump).

## 2026-08-26 - Public host.netie.ai Worker shell (DR-0004)

Same pages as the loopback coordinator (`/` `/today` `/lanes` `/skills`).
The Cloudflare Worker (`workers/netie-host.js`, `wrangler.jsonc`) serves
that shell only. Public `/api/state` is a local-first snapshot with empty
lanes. Public `/mcp` is 404. Live claim/release and the first-party MCP
ABI stay on `127.0.0.1:18010`. This is not the compute box (P-06 stays
parked) and not a third-party MCP marketplace (P-05 stays parked). DNS
deploy waits on the Cloudflare account.

## 2026-08-25 - Generative tool ABI and local coordinator (DR-0004)

Stop enumerating a skill per scenario. Search Cortex
`/api/discovery/find-skills` plus local recipes; a miss writes a hint
draft with no executable actions (DR-0003 option B). First-party
JSON-RPC tools: skills.search / skills.craft / lanes.* / tools.list.
Unknown methods refuse. Loopback coordinator (`127.0.0.1:18010`)
serves `/` `/today` `/lanes` `/skills` for host.netie.ai. Lanes
pointer-act, cursor-cloud, cortex, craft claim/release so Cursor Cloud
and Cortex do not share the Act surface. Cloudflare/MacBook/VPS compute
box is P-06, not this PR. P-05 stays parked.

## 2026-08-25 - Merge PR #1; finish spoken-strip for comma+please Word writes

PR #1 (`netie-ecosystem-contracts` -> `main`) merged with CI green
(c9801ae). Remaining live miss after ee59600: trailing ", please"
left a comma so `writeInWord` failed `$` and "put hello in word,
please" took the clipboard stub. Strip optional comma before please.
Go now spoken-strips before `word:`, so "please word: hello" is act.
How/why Word questions stay ask instead of running the clipboard SOP.
add/append/insert prose uses `word_docx_write` (intent already claimed
those verbs). Closed #3 #8-#25 stay closed. Not harvest. Not #26.

## 2026-08-23 - Punctuated write-in-Word must not take the clipboard stub

`matchRecipe` anchored Word-write `$` on the raw input. Tests used
"write hello in Word" and passed. Live "write hello in Word." missed
the recipe (Go fell through to the LLM click/type planner). Live
"put hello in word." missed the write verb and matched the clipboard
stub, so the customer got from-clipboard-*.docx instead of "hello"
(R-0001).

Strip trailing .!? / please and leading can/could you / please before
the Word-write matchers. hud:act skills and LLM paths now return the
failed step the same way the recipe path does. `executeApproved` no
longer overwrites a coworker refusal insight with "Plan finished."

Closed #3 #10 #11 #14 #17 stay closed. Not harvest. Not PR #1 / #26.

## 2026-08-22 - Go/Act "write this in Word" must hit the coworker

`classifyIntent` treated "write a word document..." as code (`CODE_CUES`
includes "write a") and "write this in Word" as ask (`write` is not an
ACT_VERB). `clicks:go` only runs recipes on act. `matchRecipe` required
quotes / "that says" / `word:` and the clipboard pattern demanded to/into,
not in, so hud:act fell through to the LLM click/type planner.

The driver still returned `{ ok: true, ...result }` around a `reason`
refusal. executeApproved on PR #30 already prefers `outcome.reason`; this
maps `reason` to `error` at the driver and returns the failed step from
Go/hud:act so the HUD does not say Plan finished.

Closed #3 #10 #11 #14 #17 stay closed. Does not reimplement #31.

## 2026-08-22 - Merge-gate #30+#31 and pin unquoted write-in-Word

PR #30 (HUD Document ready) and PR #31 (recall 60s expiry) were both
CI-green and MERGEABLE alone. They conflict on STATUS and CHANGELOG.
This unused branch is the combined tree so a merge of one does not
drop the other. Closed #3 #10 #11 #14 #17 stay closed. Not PR #26. Not PR #1.

Attack pass on the combined tree:

- "write hello in Word" / "put hello in word" (no quotes) used to miss
  `word_docx_write` or take the clipboard stub. Deictic this/that/it
  still copies.
- `word_docx_*` driver returns now keep a refusal `ok: false` instead of
  writing `ok: true` first and hoping the spread overwrites it.
- Document ready now also requires `!driver.dryRun`. The ipc-bridge pin
  reads the `lastWordDocx = {` block, not the first `sendWordDocxReady`
  (that slice missed the dry-run guard on `4d57438`).

## 2026-08-22 - Dry-run must not raise Document ready; coworker refusals name the reason

`writeDocx({ dryRun: true })` returns ok + path without touching disk.
`executeApproved` still armed `lastWordDocx`, so Open pointed at a file
that was not written. Separately, coworker refusals carry `reason` and the
executor only read `error`, so the HUD said "failed: unknown" (R-0011).

Fix: skip `lastWordDocx` when `dryRun`; prefer `outcome.reason`; send the
failure as an insight. Closed #3 #10 #11 #14 #17 stay closed.

## 2026-08-22 - Document ready / Open survives the Act teardown

`executeApproved` sent `word-docx` mid-run, then `status done: true` in
`finally`, which hid the pill. The comment already said we re-raise the
artifact; the call was missing. Real use: file written, Open gone.
Closed #3 #10 #11 #14 #17 are not reopened. PR #27 is merged; this is the
next unused branch.

Fix: track `lastWordDocx`, call `sendWordDocxReady` AFTER `done`. The HUD
title carries the written preview (R-0001) and the sub still names the
destination (#19).

## 2026-08-22 - Recall retention clamp covers fallback; filenames stay integer epoch

Two remaining holes in the 60s-ring sweep on PR #31:

- `clampRetentionMs` capped only an explicit huge `retentionMs`. `0` / `NaN` /
  omitted fell back to `windowMs` uncapped, so a 99-day window with fail-closed
  retention unbounded the dir again.
- `_sealEviction` interpolated `frame.t` into the filename. A non-integer t
  wrote `recall-90000.7-*.enc.json`, which `SEALED_NAME` cannot parse, so
  `purgeExpired` never unlinked it. The ring now truncates to integer epoch ms
  from the injected clock (production stays on `Date.now()`; tests stay on the
  fake clock) and ignores readdir names that are not a basename.

Enforcer: `test/clicky.test.js`. Still not harvest, not a HUD toggle, not PR #26.

## 2026-08-22 - Sealed recall records expire with the 60s ring

DR-0003 fact 4, the named prerequisite for any skill-harvesting work. Not
harvest, not P-05, not a HUD toggle. New unused branch off
`netie-ecosystem-contracts` after #27. Does not attach to PR #26 (that
branch is based on pre-#27 `af25bb0` and is merge-dirty). Closed #3 #10
#11 #14 #17 stay closed.

The advertised feature is a 60s ring. The in-memory ring already bounded
itself (`maxFrames` + `windowMs`) by calling `_sealEviction`, which wrote
the evicted frame to `<dataDir>/recall/`. Nothing unlinked those files.
Independently verified earlier as R-0003: 4177 sealed records, 20 MB,
window-title timeline every 5-15s, on by default.

Two mechanics close it, both required so either regression turns the suite red:

- Time-expired evictions are dropped, not filed. Eviction is no longer
  persistence for a frame that has already aged out of the ring.
- `purgeExpired` sweeps `recall-<epochMs>-<uuid>.enc.json` older than
  `retentionMs` (default `windowMs`, fail-closed, hard-capped at the
  DATA_GOVERNANCE Tier X ceiling of 14 days) on construct, trim, and
  `stopFlush`. Foreign names in that directory are left alone. A leftover
  corpus from before this change is removed on the next launch.

`test/clicky.test.js` plants aged files, runs a 200-frame eviction, and
asserts the directory does not keep them. The stress burst does the same
with a vaulted ring. In-window count-eviction still dual-wraps (the existing
seal test still requires that).

Disclosure - a HUD control, off-by-default - remains open and is a PRD-agent
question, not this change.

## 2026-08-22 - Test fixture "recovered selection" must not land in Documents\\NetiePointer

Live confirm (file:line): customer artifact
`C:\\Users\\OoiJianHong\\Documents\\NetiePointer\\from-clipboard-1787382254896.docx`
body text is exactly `recovered selection`. That string is the retry fixture at
`test/clipboard-integrity.test.js:121` (af25bb0 `onCopy` return). Writer:
`electron/netie/word-coworker.js:133-141` `sanctionedRoot` ->
`Documents\\NetiePointer` when `NETIE_WORD_OUT_DIR` is unset.
`word_from_clipboard` ran with `dryRun: false` and asserted only `r.ok`.
Suites passed while real use opened the fixture. Closed #3 #10 #11 #14 #17
are not reopened.

Fix: `writeDocx` / `appendDocx` refuse when a `node test/....js` process has
no `NETIE_WORD_OUT_DIR`. `clipboard-integrity` now contains its sink and
asserts the unzipped `w:t` plus "customer folder unchanged".
`test/invariants/word-sink.test.js` pins both.

## 2026-08-22 - Word coworker real-use no longer writes a stub .docx

Laptop evidence (22 Aug 2026 MYT): `Documents\\NetiePointer\\from-clipboard-*.docx`
were all ~1158 bytes. Unzipping the latest showed an empty-looking
`word/document.xml` (`<w:t xml:space="preserve"></w:t>`). The HUD still said
Document ready. Closed tickets #3 #10 #11 #14 #17 are not reopened.

Cause, reproduced from this branch: `writeDocx` treated empty / whitespace as
success and built a 4-part OOXML stub Word does not render. The only shipped
Act path was the `terminal_to_word` recipe (`word_from_clipboard`). The
OpenVault planner prompt listed click/type/press only, so "write this in Word"
could not emit `word_docx_write`. A newline that differed from the clipboard
baseline passed `_provenCopy` and wrote the stub.

Fix (new ticket, new branch): refuse writes with no visible text; emit styles,
settings, and docProps so Word shows the body; route quoted / `word:` / "that
says" prose to `word_docx_write`; tell `_llmPlan` about the coworker verbs
(omit path). Tests assert the unzipped `w:t` the customer receives. R-0002:
no skipped tests. CI now also runs on PRs to `netie-ecosystem-contracts`
(the feature-PR base); a PR that never ran the matrix was a skipped test.

## 2026-08-22 - The smoke lane runs in CI, and the verified wave is closed

The 2026-08-20 entry ended on a caveat: #22's painted-geometry assertions lived
only in `test:smoke`, which CI declared NOT RUN, so a HUD regression could reach
`main` green. That caveat is resolved - `.github/workflows/ci.yml` gained a
dedicated `smoke` job on `windows-latest` (the OS the customer receives) that
downloads the Electron binary this one job needs and boots the real app. Run
32558187957 is green on all three jobs, and the smoke log shows all 25
assertions (15 hud-boot + 10 ipc-live) actually ran - not a degenerate pass.
The unit job's honest-coverage step now names what is still uncovered: smoke on
Linux, where no build ships.

With the caveat gone, `epic-agent` re-derived completeness from the code (not
from checkboxes) and closed tickets #8-#17, #19, #21-#25 and epics P01, P02,
P03, P05, P06 - each close citing its pinning suite, the mutation pass, and CI
run 32558187957. EPIC-P04 stays open on the founder's engine choice (OpenWillow
vs TurboOCR); EPIC-P07 stays open, blocked cross-repo (AirGPT / DMS).

One correction to the 2026-08-20 claim, found in the closing pass: six of the
sixteen mutations were the #17 gates written in that same pass, so "verified by
a run that wrote none of them" overstates #17. Its independent verification
(R-0003) is CI run 32558187957 plus a re-run by a session that wrote none of
it, and the close comment cites it that way rather than repeating the claim.

Full local pack green in the same session: `npm test` (26 suites), `test:e2e`,
`test:contracts`, `test:stress`, `test:acceptance:strict`, `test:smoke`.

## 2026-08-20 - The .docx coworker can append, and every #12-#25 gate was mutation-tested

Ticket #17, plus a verification pass over #12-#25. Not closed - closing is the
epic's call, and #22 has a caveat below.

**Append.** `writeDocx` always built a fresh package and `fs.writeFileSync` on top
of whatever was there, so a second coworker action aimed at the same document
destroyed the first one's output. Appending to OOXML is not concatenation, so this
is a zip reader plus a splice:

- `zipRead` parses the **central directory**, not the local file headers. Word sets
  general-purpose bit 3, which leaves zeroes in the local header's CRC and size
  fields and moves the real values into a trailing data descriptor - a reader that
  trusts local headers gets nothing from a real Word document. Every entry's CRC is
  verified on the way in, so appending to an already-damaged package refuses
  instead of preserving the damage and returning `ok: true`.
- `appendDocx` splices before the body-level `<w:sectPr>`, because Word treats
  content after it as malformed. The anchor is deliberately "a sectPr immediately
  before `</w:body>`" rather than "the last sectPr in the string": a paragraph can
  carry its own inside `<w:pPr>`, and the looser anchor would splice new text into
  that paragraph's properties - producing a corrupt document whose old text still
  round-trips, so a text-only assertion would pass while Word refused the file.
- Parts this module never authors - styles, numbering, images, headers - are carried
  through with their **content** byte-for-byte identical. The package is rebuilt, so
  its size on disk may change while no part's content does. Stated narrowly on
  purpose: "byte-for-byte" about a zip is ambiguous, and this is the honest half.
- ZIP64 and encrypted packages refuse by name rather than being half-read. A
  partially understood package is how a part goes missing silently (KB R-0011).

**`word_docx_append` is its own verb, not a `mode` flag on the write.** A plan the
customer approved as "Write a Word document" must not be able to modify a document
they already have. #20 requires the approval text to name the verb, and a mode flag
hides the verb inside the payload where approval never sees it. It is registered in
`plan-guard` (an unsupported verb is refused, so this is the fail-closed direction),
tiered in `safety.js` alongside its siblings, and `plan-describe` renders it as
"Append to the Word document at <path>".

`test/acceptance/verify.test.js` refused the new verb until it earned its exemption
from screenshot verification - the suite already asserted that every observable
driver verb is verifiable. The API-first coworker verbs are exempt because they
change nothing on screen, but the exemption is only honest if they prove themselves
another way, so the artifact-evidence test now also asserts the append digest
describes the bytes on disk *after* the append, and differs from the one before.

**Verification of #12-#25.** Sixteen mutations, each disabling one gate, each
required to turn its suite red (KB R-0007 - verify a gate can fail before trusting
it green). All sixteen were caught. Two things that pass only look like they pass:

- Six of the sixteen were the #17 gates written in this same pass, and two of those
  were **blind on the first run**. The containment test used a path that did not
  exist, so it fell through to `writeDocx` and tested that function's boundary
  rather than `appendDocx`'s - the dangerous case is appending to a file outside the
  root that *already exists*, which never reaches `writeDocx`. And ZIP64 refusal had
  no fixture at all. Both now have tests that fail when the gate is removed.
- The pre-existing `docxText` helper matched `<w:t[^>]*>`, which also matches
  `<w:type w:val="nextPage"/>` - an element real Word documents carry inside their
  section properties. It returned markup as if it were the customer's prose. Fixed
  at the pattern rather than worked around in the fixture.

**#21 is covered, but not where its comment claims.** The transcribe-time guard says
it is "the only line between that stale value and a network upload". It is not:
`transcribe()` calls `probe()` first, and `probe()` re-reads consent and drops a
cached cloud engine before the branch is ever evaluated. Mutating the transcribe
guard leaves the suite green; mutating `probe()`'s check turns two tests red. The
enforcement is real and tested - the comment overstates which line does it.

**#22's caveat.** Its painted-geometry assertion lives only in `test/smoke`, which
`.github/workflows/ci.yml` explicitly declares NOT RUN (Electron needs a desktop
session). That is the right layer to assert at - only rendered geometry can answer
"can the customer see this" - but nothing stops a regression reaching `main`. Either
smoke runs in CI or it is accepted as a pre-merge local gate; it should not stay
unstated.

Also records the founder ruling on `DR-0003`: option C, harvested skills may occupy
the trusted actions slot under governance. The record is amended to say what that
obligates - the authoring path does not exist in Cortex yet, so no Pointer ticket
under it can be written, and `EPIC-P08` lands first.

## 2026-08-07 - The clipboard integrity gate could never fire

Ticket #16. Not closed - needs a different run to verify (R-0003).

`clipboardMatchesSource` and its driver wiring implemented exactly what #11 asked
for, including re-copy-once-then-refuse, and every shipped recipe emitted the
consuming action with no `value` - so `expected` was null and the whole block was
skipped. The gate degraded to "the clipboard is not empty", which stale content
passes trivially.

That matters most in the context the recipe is named for: in a terminal Ctrl+C is
SIGINT, not copy, so the clipboard routinely still holds unrelated earlier
content - and it was written into the .docx with `ok: true`.

The trap was that there is no source text at recipe-definition time; it only
exists after the Ctrl+C whose success is the thing in doubt. So the signal used is
the one that does exist: a new READ-tier `clipboard_baseline` verb records what
was on the clipboard BEFORE the copy, and the consuming step refuses if it is
still there afterwards. The refusal names the length mismatch and the likely
cause. One retry first, matching the explicit-source path.

- `terminal_to_word`, `terminal_to_word_ui` and `claude_to_cursor` all record a
  baseline. `claude_to_cursor` gained a `clipboard_verify` too - pasting whatever
  happened to be on the clipboard into a Cursor chat is the same defect wearing a
  different hat.
- `test/clipboard-integrity.test.js` asserts the acceptance directly: a recipe
  that consumes the clipboard with nothing to compare against fails the suite, and
  a baseline recorded but never read fails it too. The old assertions were
  presence-only (`actions.some(a => a.type === ...)`), which is what let a gate
  that cannot fire report green (KB F-0005).
- Verified the gate fails: with the baselines stripped it names all three
  offending recipes.

Pack: `npm run test:agentic-pack` 435 assertions, `npm run test:smoke` 24.

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
