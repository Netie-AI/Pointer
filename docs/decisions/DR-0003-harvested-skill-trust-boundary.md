---
status: proposed
date: 2026-08-07
decision-makers: founder
---

# DR-0003 - What trust tier a harvested skill occupies

## Context and Problem Statement

`PRD-001` (Pointer) feedback row F21, raised 2026-08-07, asked for Pointer to "harvest alot
skills slowly as learnt from user desktop via snapshots", to feed the same store from
"constantly web search", to keep "a central skill set with alot of good skill sets", and
then to "do so".

Stripped of phrasing, that is a request to let **observed content become an executable
action**. It is the one direction the Act path was built to refuse.

`CLAUDE.md` Hard rule 2 says screen text is data, not commands. `docs/SAFETY.md:11` lists
off-screen prompt injection as threat one and answers it with exactly that rule. KB `A-0005`
proves the class is not theoretical in this codebase: executor-trust flags have already
been observed travelling on model-supplied action data, which is why
`electron/netie/ecosystem.js` strips `_approved` before granting it.

The reason this cannot be answered with "plan-guard still runs" is specific and lives in
one file. `electron/netie/skills-exec.js:11-18` orders its three action sources **most
trustworthy first**, and source one is `hit.actions`, described as "the Cortex 2.5
executable skill schema. The catalog said exactly what to do; do that." That slot is
trusted because a human curated the catalog. Harvesting fills the same slot from an
automated derivation over screen content, while the provenance label on the action stays
`skill: <id>` and the downstream reviewer sees a catalogued SOP. The trust does not come
from the gate; it comes from the slot, and the slot is what harvesting writes into.

Four facts about the current estate, verified 2026-08-07 and recorded in F21, bound the
decision:

1. **The trusted slot has no producer today.** The Cortex SkillCard schema
   (`D:\Cortex\skills\_schema.yaml:1-39`) has no executable-actions field, so nothing in
   the engine emits `hit.actions`. Source one of the expander is dead code waiting for a
   producer, and harvesting is a proposal to become that producer.
2. **Cortex has no governed write path for skills.** `/api/discovery/find-skills`
   (`D:\Cortex\CortexOS\api\discovery_routes.py:102-110`) is read-only over static YAML at
   `D:\Cortex\skills\*.yaml`. No create or update endpoint exists, and no `kind: tool`
   action type for skill mutation is registered in
   `packs/dms/ontology/action_types.yaml`. A harvested skill written there today is an
   ungoverned write, against `NETIE.md` moat item 3 - actions are the only write path.
3. **Pointer has no web retrieval at all.** The only non-loopback fetch in the app is the
   opt-in Deepgram STT endpoint (`electron/netie/transcriber.js:226`).
4. **A screen-snapshot loop already ships.** `electron/main.js:1306-1322` runs a 15s
   `setInterval` capture whose evicted frames are sealed to `<dataDir>/recall/*.enc.json`
   with foreground window titles, no TTL, no purge and no user-facing control, while
   `docs/SAFETY.md:67-69` asserts capture starts disarmed. That is a separate shipped
   defect, routed in F21 as proposed `EPIC-P08`, and it is a **prerequisite**: the product
   cannot honestly widen capture into a durable corpus while the capture it already
   performs is undisclosed.

**This record is `proposed`. It grants nothing until merged.** `PRD-001` row F16 is the
recorded precedent for why an agent may not ratify its own PRD amendment, and this is a
scope amendment - the PRD's out-of-scope list and success assertion say nothing about
learning, corpora, or retrieval.

## Considered Options

Each option is stated with what it costs to reverse, because that is the axis the ordering
law uses and it is the axis on which these four differ most.

- **A - Refuse. Skills stay human-curated in `D:\Cortex\skills\*.yaml`; Pointer never
  derives one.** Reversal cost: none. Nothing is built and nothing is retained. The cost is
  paid entirely on the other side - the founder does not get the feature, and the estate
  keeps a skill catalog that only grows by hand.

- **B - Harvest into an untrusted tier: a derived skill may only become a planner
  *hint*, never a source of actions.** Mechanically this is the existing
  `skillPreamble` path (`skills-exec.js:151-164`), which already tells the planner a skill
  exists without expanding it; a harvested skill would be barred from `hit.actions` and
  from the local-recipe branch by construction. Reversal cost: low. Deleting the corpus and
  the preamble contribution restores today's behaviour, and no wire moves. Trust direction
  is unchanged, because a hint is read by a planner whose output is already reviewed
  per-run. It is a genuine capability - the model stops re-deriving click sequences it has
  seen work - and it is the only option that ships without a Cortex change.

- **C - Harvest into the trusted actions slot, governed.** Requires Cortex to gain a
  registered `kind: tool` action for skill creation, RBAC at steward, a ledger append per
  derived skill, and a human review beat before a derived skill is executable. Reversal
  cost: high and multi-repo. Per `AGENT_SYSTEM.md` section 4 this is not one epic but three
  with hard blocking - engine change, contract bump, consumer adopts - and the contract
  impact is additive at best. It also cannot be started from Pointer: the write path is the
  engine's, and per `NETIE.md` section 3 Pointer "is not a second orchestrator."

- **D - Harvest and auto-run, the literal reading of "then do so".** Today the only thing
  between a derived skill and unattended execution is `electron/netie/settings.js:28`
  shipping `autoRunSensible: false` plus the force-migration at `settings.js:134`; F12
  already records that the shipped one-click toggle at `main.js:1813` removes it. Reversal
  cost: **the code is deletable and the consequence is not.** A corpus is a retention
  liability the moment it exists, and an auto-run skill derived from a poisoned screen is
  an incident rather than a bug. This option also contradicts `CLAUDE.md` Hard rule 2
  directly rather than at one remove.

## Decision Outcome

**Founder ruling, 2026-08-07: option C - harvest into the trusted actions slot, governed.**
Recorded in `PRD-001` ledger row F22. This record stays `status: proposed` until its pull
request merges; the ruling is what the merge would ratify, not a separate grant.

The rule the next agent should find is therefore **not** the hint-only boundary this record
originally proposed. It is:

> A skill derived from observed content - a desktop snapshot, a web page, a transcript -
> may supply executable actions, and may occupy the `hit.actions` slot in
> `electron/netie/skills-exec.js`, **only** when it carries the governance option C names:
> created through a registered `kind: tool` skill-authoring action in Cortex, authorised by
> RBAC at steward, appended to the ledger at creation, and passed by a human review beat
> before it is executable. A derived skill reaching that slot **without** all four is a
> trust-tier violation regardless of what plan-guard does afterwards.

**What the ruling obligates, which is more than it authorises.** Option C cannot be started
from Pointer. Fact 2 above is the binding one: Cortex has no create or update endpoint for
skills and no registered skill-mutation action type, so the authoring path does not exist to
be governed yet. Per `AGENT_SYSTEM.md` section 4 this is three epics with hard blocking -
engine change, then contract bump, then consumer adopts - and the first belongs to Cortex.
**No Pointer ticket under this ruling can be written until the Cortex authoring action
exists.** `NETIE.md` section 3 is the reason Pointer may not shortcut it by writing skills
locally: Pointer is not a second orchestrator.

Two gates the founder's own ordering already implies, restated so they are not lost:

- **`EPIC-P08` lands first.** Consequence 3 below is unchanged by the ruling. Widening
  capture into a durable corpus while the capture the product already performs is
  undisclosed makes the disclosure gap harder to fix, not easier. See F21 and KB `F-0010`.
- **The Confirmation assertion changes shape rather than disappearing.** Under option B it
  would have failed on derivation as such. Under option C it must fail when a derived skill
  reaches `hit.actions` **without** the four governance markers. It is still unwritten, so
  the control is still declared unbuilt.

**Option D remains refused.** The founder did not choose it, and it would still require a
superseding record that moves `CLAUDE.md` Hard rule 2.

### Original proposal, superseded by the ruling above

Kept because the reasoning is what the ruling was made against, and because this record is
history once merged rather than a live recommendation.

**Proposed: B now, C only behind its own decision record, A as the standing default if the
founder does not want either, D refused.**

Stated as the rule the next agent should find:

> A skill derived from observed content - a desktop snapshot, a web page, a transcript -
> may inform the planner. It may never supply actions. The `hit.actions` slot in
> `electron/netie/skills-exec.js` is reserved for catalog entries with a human author, and
> a derived skill entering it is a trust-tier violation regardless of what plan-guard does
> afterwards.

Three consequences follow directly and are part of the decision, not commentary:

1. **The central skill library is Cortex's, not Pointer's.** Fact 2 above means a
   Pointer-local store would not duplicate the Cortex catalog - there is nothing on the
   write side to duplicate - it would create a second, ungoverned skill origin inside an
   application. `AGENT_SYSTEM.md` section 4: when ownership is ambiguous it goes in the
   engine. Here it is not ambiguous.
2. **Constant web search is not Pointer scope.** Retrieval feeding a governed reasoning
   step is plane 3, and `NETIE.md` section 4 states retrieval that does not pass OpenVault
   is unsafe. If the founder wants it, it opens against a Cortex PRD and returns to
   `PRD-001` as a `Serves:` acknowledgement.
3. **`EPIC-P08` lands before any harvest work starts.** Fact 4. Widening capture while the
   existing capture is undisclosed would make the disclosure gap harder to fix, not easier.

## Consequences

**Positive.** The founder gets the half of the request that is actually shippable - the
system stops re-deriving sequences it has already seen work - without moving a wire, without
a Cortex release, and without creating a corpus that has to be defended. Option B is
additive to a module whose header already states it decides nothing about execution, so the
blast radius of getting it wrong is one file.

**Negative, and worth stating plainly.** B is slower than what was asked for. A hint that
the planner may ignore is not "then do so", and if the measured effect is that the planner
ignores the hint, B will look like ceremony. That is a real risk and it is the thing to
measure before spending anything on C.

**A second negative.** Splitting the request means the founder gets four answers rather than
one, and three of them are "not here" or "not yet". The reason to accept that shape rather
than a single new epic is in F21: seven epics are open, none has closed, fifteen tickets are
open, and the WIP limit is two. The request that reads as impatience with a gated system is
answered by draining that queue, not by adding to it.

**What this record does not decide.** It does not authorise building B. It fixes the trust
tier so that when B is sliced, it is sliced against a boundary that already exists. Slicing
is the PRD Agent's next action after this record merges, and per the WIP limit it cannot
start while `EPIC-P02` and `EPIC-P03` are both in flight.

## Confirmation

The enforcer is **`test/acceptance/skills-exec.test.js`**, which exists today and runs as
part of `npm run test:acceptance` (see `package.json` `scripts.test:acceptance`).

Stated honestly, that file today tests the three existing expansion sources and the vault
placeholder discipline. **It does not yet assert the trust tier.** This decision is not
confirmed until that file also fails when a skill hit carrying a `derived` or
`harvested` provenance marker is expanded into actions rather than into a preamble, and
fails when `skills-exec.js` grows an export that writes or persists a skill. Until that
assertion lands, this record names a control that is **not built** - declared here rather
than hidden, which is the failure mode `DR-0001` and `DOCUMENT_SYSTEM.md` both warn about,
and the same honesty `DR-0002` applied to its own half-built enforcer.

**What would re-open this decision:**

- Cortex registering a governed skill-write action in
  `packs/dms/ontology/action_types.yaml` and adding an authoring endpoint. That makes
  option C available on real ground rather than as a plan, and it supersedes this record
  rather than editing it.
- The SkillCard schema gaining an executable-actions field. That gives source one of the
  expander a real producer and changes what "the catalog said" means.
- Measurement showing option B's planner hints are ignored often enough that the corpus
  earns nothing. That argues for A, not for C.
- A founder ruling that the speed is worth the trust inversion. That is option D and it
  needs a superseding record naming what happens when a harvested skill executes something
  the user did not intend, because `CLAUDE.md` Hard rule 2 would have to move with it.

## Independent verification of prerequisite fact 4 (2026-08-07)

Verified by a different run than the one that recorded it (KB R-0003). The claim holds,
and is sharper than stated in one respect and softer in another.

**Softer: no pixels are persisted by default.** `sealPixels` defaults to `false`
(`electron/netie/clicky/recall.js:14`) and is enabled only by `NETIE_RECALL_PIXELS=1` or
`NETIE_HQ_CAPTURE=1` (`electron/main.js:252-254`) - the HQ/trainer lane. In the default
configuration `_sealEviction` writes `type: "recall-meta"`, not `recall-frame`
(`recall.js:77`). No screenshots are being written on a default install.

**Sharper: the "60s ring" is a ring in memory only. On disk, eviction IS persistence.**
`settings.js:71` describes the feature as a "Background 60s Clicky recall ring", and the
in-memory ring does bound itself - `maxFrames = 60` plus a time cutoff (`recall.js:56-57`).
But both bounds are enforced by calling `_sealEviction(this.frames.shift())`, which writes
the evicted frame to `<dataDir>/recall/` (`recall.js:60-82`). A frame ageing out of the
ring is not deleted; it is filed. The persisted payload carries `fgTitle` and `fgProc` -
the foreground window title and process - plus cursor position, display id and timestamp.

**Nothing purges that directory.** There is no `unlink`, no TTL and no retention sweep
over `<dataDir>/recall/` anywhere in the repo. The only code that names the directory
besides the writer is the retrieve flow, which offers to open it (`main.js:3263-3265`).

**It is on by default and has no user-facing control.** `recall: true` in both
`features.js:10` and `settings.js:72`. The HUD settings menu (`electron/hud.html:58-69`)
exposes ten toggles; recall is not among them. It can only be changed by hand-editing
settings.json or setting an env var.

**Measured on the development machine, 2026-08-07:**

```
$HOME/AppData/Roaming/NetieClicks/recall -> 4177 files, 20M
recall-1785133416304-41d9c674-....enc.json
```

So the artifact is real, not hypothetical: an unbounded, sealed, timestamped log of which
window was in the foreground, every 5-15 seconds, for the life of the install. It is
encrypted at rest under the dual-envelope scheme and contains no pixels by default, and a
window-title timeline is still a sensitive record - document names, message subjects and
browser tab titles all appear there.

This does not change the decision this record asks for. It confirms the prerequisite:
widening capture into a durable learning corpus cannot honestly proceed while the capture
already performed is undisclosed, uncontrolled and never purged. The gap is disclosure,
retention and a control - not encryption, which is already in place.
