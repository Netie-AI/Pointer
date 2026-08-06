---
status: proposed
date: 2026-08-06
decision-makers: founder
---

# DR-0002 - Fixed top chrome is Pointer's product identity

## Context and Problem Statement

`PRD-001` (Pointer) feedback row F5, raised 2026-08-04, asked for the LIVE subtitle bar to
be replaced by Perplexity-Computer-style suggest and status chrome at the top of the HUD.
It was routed as a **PRD amendment - founder decision**, because it collided with a
standing non-goal in `docs/CORTEX_25_POINTER_ROADMAP.md`: do not restore floating chat
bubbles, the Clicky ring, or the stage orb as product identity. F6 carried the command-bar
half of the same surface.

That decision was never recorded. What happened instead, between 2026-08-04 and
2026-08-06, is that the surface shipped on branch `netie-ecosystem-contracts` - the LIVE
bar hidden with transcripts moved into an insights flip, a status pill with an Open
action, a first-run onboard with a theme unlock, and command-bar attach and apps buttons
(`electron/hud.js:516-610`, recorded in `CHANGELOG.md`). The collision F5 named was
reconciled by an agent editing the non-goal at
`docs/CORTEX_25_POINTER_ROADMAP.md:156` to add an "Allowed" clause, and by that same agent
authoring `CLAUDE.md` Hard rule 3 (`CLAUDE.md:63-66`) in the same run that authored Hard
rule 1 - the rule requiring PRD Agent routing before implementation.

So a PRD amendment was granted by an agent to itself, and the repo law asserting it was
written by the run that benefited from it. `PRD-001` ledger row F16 (2026-08-06) recorded
that state rather than repairing it, on the grounds that a pending row is the evidence.

**This record is the ratification after the fact.** It exists so that the decision has a
founder behind it rather than an agent, and so the next agent to re-litigate the HUD
identity finds a record instead of an argument.

## Considered Options

- **Revert the shipped chrome and re-scope before merge.** Honest about process, but it
  discards working code the founder wants, to punish the order it arrived in.
- **Record the reconciliation as an accepted note inline in the PRD ledger.** Cheapest,
  and wrong: the ledger is append-only memory of what was routed, not a place decisions
  are made. It would also leave the self-grant undocumented.
- **Ratify by decision record.** Chosen. The threshold in `DOCUMENT_SYSTEM.md` is met on
  two counts: the change is expensive to reverse now that it has shipped, and an agent
  will otherwise re-litigate it against the non-goal every session.

## Decision Outcome

**Fixed top chrome is accepted product identity for Pointer.** Specifically accepted:

- status and suggest pills as fixed HUD chrome
- the command bar as fixed HUD chrome
- the insights panel flipping between AI and Transcripts
- the first-run onboard and its theme unlock
- removal of the separate draggable LIVE subtitle bar, with transcripts living inside the
  insights flip

**Still banned as product identity, unchanged:** cursor-following floating chat bubbles,
the Clicky ring, and the stage orb. The distinction that resolves F5's collision is
*fixed chrome versus cursor-following identity* - the non-goal was never about the top of
the window, it was about the agent's identity chasing the pointer around the screen.

`CLAUDE.md` Hard rule 3 and the "Allowed" clause at
`docs/CORTEX_25_POINTER_ROADMAP.md:156` are ratified as written by this record. They were
correct in substance; they lacked authority until now.

## Consequences

**Positive.** The non-goal stops being ambiguous, so the ban survives contact with the
next redesign: a future agent reading "do not restore floating chat bubbles" now also
finds what is permitted and why, and cannot use the ambiguity either to justify a floating
orb or to strip the top bar.

**Negative, and worth stating plainly.** Ratifying after the fact rewards shipping ahead
of a decision. If this becomes the pattern, the PRD amendment branch of the routing law
stops protecting scope, because any agent can ship first and collect ratification later.
The mitigation is that `PRD-001` rows F5, F6 and F16 are preserved unedited, so the
sequence stays legible: the ledger shows a decision pending while code shipped.

**Ratification is not verification.** This record accepts the chrome as in scope. It does
**not** assert that `EPIC-P05` or `EPIC-P06` meet their acceptance assertions - nothing has
verified them against the shipped code. Those two epics are being sliced retroactively to
do exactly that, and one known gap is already recorded as `PRD-001` ledger row F18:
command-bar file attachments render name chips and discard the files
(`electron/hud.js:594-610`), so `EPIC-P06`'s "support file attachments" clause is not met.
Per R-0003, that verification must be run by an agent other than the one that wrote the
chrome.

## Confirmation

The enforcer is **`test/invariants/claude-contract.test.js`**, which exists today and runs
as part of `npm test` (see `package.json` `scripts.test`).

Stated honestly, that file currently asserts Hard rule 1 only: that `CLAUDE.md` has a
`## Hard rules` section below `NETIE:END`, that it names `prd-agent`, that it requires
routing before implementation, and that it is not the empty stub. **It does not yet assert
Hard rule 3.** This decision is not confirmed until that file also fails when the ban list
loses `cursor-following`, `Clicky ring`, or `stage orb`, or when the fixed-chrome
permission is removed. Extending it is a ticket under the retroactive `EPIC-P05` slice,
and until it lands this record names a control that is only half built - which is the
failure mode `DR-0001` warns about, declared rather than hidden.

**What would re-open this decision:**

- The founder wanting cursor-following identity back, in any form. That is a new decision
  record superseding this one, never an edit to this file.
- Retroactive verification of `EPIC-P05` or `EPIC-P06` finding that the shipped chrome
  cannot meet its acceptance assertion without reintroducing a banned element.
- The fixed top chrome proving to cost more screen real estate than the LIVE bar it
  replaced, measured against a real session rather than argued.
