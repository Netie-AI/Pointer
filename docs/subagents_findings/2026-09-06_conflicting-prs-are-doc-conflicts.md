---
keywords: merge=union, gitattributes, conflicting PRs, governed docs, R-0013, DR-0005, stale branch
main_idea: Twelve CONFLICTING PRs had zero code conflicts - all five contended files were governed docs; union merge for the append-only ones cuts each PR to a single deliberate conflict
---

# Twelve conflicting PRs, zero code conflicts

## The measurement

Nine reviewable PRs (#47-#49, #51-#56) test-merged onto `origin/main` one at a
time, in a detached worktree. Conflicts landed in exactly five files:

    CHANGELOG.md  STATUS.md  PARKING_LOT.md  docs/ACTIVE.md
    docs/subagents_findings/INDEX.md

Not one code conflict in any of the nine. The branches never disagreed about
capability - only about whose changelog entry goes first. All six UIA PRs were
a single commit behind main.

## The fix, and its boundary

`.gitattributes` gives `merge=union` to CHANGELOG.md and the findings INDEX.
Re-running the same nine merges against that base cuts every one of them to a
single contended file, and it is always a state file:

| PR | onto main | onto the fixed base |
|----|-----------|---------------------|
| #47 #49 #51 #52 #53 #54 #56 | CHANGELOG, STATUS, INDEX | STATUS |
| #48 | CHANGELOG, STATUS, ACTIVE, INDEX | STATUS, ACTIVE |
| #55 | CHANGELOG, PARKING_LOT, INDEX | PARKING_LOT |

**Union is only safe for a file that is never edited except by appending.**
STATUS.md, PARKING_LOT.md and docs/ACTIVE.md have content REMOVED as it stops
being true, and union never deletes - it would silently resurrect a parking
entry another branch had just retired. Those three must keep conflicting: two
branches disagreeing about what is true right now is a judgement call, and a
conflict is how you ask for one.

Gate: `test/invariants/merge-strategy.test.js` builds a throwaway repo, forks
it, appends on both sides and merges. Asserting the attribute spelling would
pass a typo'd path. Mutation-tested both ways - removing union goes red, and
adding union to PARKING_LOT.md goes red naming the resurrection.

The residue is structural: STATUS.md is what is true for MAIN, so a feature
branch asserting it is premature. Either PRs stop editing STATUS.md and the
merger writes it, or every merge resolves it by hand. Founder call.

## Estate defects found while measuring

- **`feat/unattended-ledger-mandate` is 158 commits behind main** (9 ahead,
  merge-base 2026-08-23). Merging it as-is DELETES three decision records that
  exist on main - `DR-0004-generative-tool-abi.md`,
  `DR-0005-coworker-desks-online-workspace.md`,
  `DR-0005-uacc-detectable-loopback.md` - and rewrites PARKING_LOT.md so the
  **P-06 compute box** entry disappears and P-07 renumbers into P-06. Rebase,
  never resolve by hand.
- **Two reused IDs, not one.** main has `DR-0004-generative-tool-abi`; the
  stale branch has a different `DR-0004-unattended-pointer-identity-and-connectors`.
  main separately carries two `DR-0005` files. R-0013 forbids reuse; both need
  renumbering.
- **DR-0005 already made Pointer screenshotable by default.** `settings.js` on
  main ships `captureVisible: true` with a v3 migration that flips older
  installs, because UACC and other agents must be able to see the HUD before
  they can drive it. Any work premised on "the HUD cannot be screenshotted"
  is true only on the stale branch.
- **Both HUD defects found by screenshot on 2026-09-05 are live on main**: four
  selectors at `z-index: 40` (.peek-drop, .point-layer, .onboard, .menu), and
  `max-width: min(980px, 94vw)` with wrappable pills.
- **A third, worse one, found by porting the gate to main.** The settings menu
  measures **1255px tall on a 912px viewport**, with `max-height: none` and
  `overflow-y: visible`. Six of its 26 rows - the Scribe settings, dictation
  language, and "Visible to screen capture" - are painted below the bottom of
  the display with no way to scroll to them. A panel that paints a control it
  cannot deliver is worse than one that omits it: the customer is told the
  setting exists.

## The gate-porting lesson

Two of the three ported gates failed on main for reasons that were not the
defect they were written for:

- one asserted `themes.length >= 4`, true on the branch it was written on and
  false on main. Assert that the ENUMERATION worked, never a count that differs
  per branch.
- two records each opened the settings menu by clicking `#btn-more`, which
  TOGGLES. The second click closed it, and the failure read as a layout bug
  rather than as test order. Assert the state you want; do not assume the
  transition.

## Reusable

A pile of simultaneously-conflicting PRs is worth measuring before it is worth
triaging. `git merge --no-commit` in a detached worktree, once per PR, costs
minutes and answers whether the estate has an integration problem or a tooling
one. Here the answer was tooling, and the "twelve conflicting PRs" headline had
been read as a capability crisis for over a week.

cite: session 2026-09-06, Pointer PR #59
