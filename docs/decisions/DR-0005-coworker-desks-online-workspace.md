---
status: proposed
date: 2026-08-27
decision-makers: founder
---

# DR-0005 - Coworker desks and an online artifact workspace

## Context and Problem Statement

Founder request (2026-08-27): Pointer must be the coworker that replaces
Clicky (heyclicky.com) and Cluely, stronger than OpenWorker, and usable
online the way Cloudflare Computer is a workspace you can reach from the
web. The same request asked to "clone" those projects and strip licenses.

This is a PRD amendment. It does not reopen EPIC-P04/P07. It does not
unlock P-05 (third-party MCP / connector marketplace) or P-06 (compute
box / sandboxed runtime). Harvested skills still cannot fill `hit.actions`
(DR-0003). Fixed top chrome stays product identity (DR-0002). Act stays
fail-closed (Hard rule 2).

## Considered Options

- **Vendor OpenWorker and Cloudflare Computer, strip licenses.** Illegal,
  and it would import a connector marketplace plus a cloud runtime Pointer
  has already parked. Rejected.
- **Unlock P-06 and run Act in a Worker.** The laptop has not failed a
  real session twice, and the founder has not picked Cloudflare vs
  MacBook vs VPS. Rejected.
- **Original coworker desks plus a workspace with no runtime.** Chosen.
  Pointer already has screen Act, Word, POINT teach, capture-hidden HUD,
  and a public host shell. What was missing was the specialist-desk
  catalog (finished deliverables, not chat) and an online page that can
  show those artifacts without executing anything.

## Decision Outcome

1. **Original code only.** Pointer does not vendor OpenWorker, Cloudflare
   Computer, Clicky, or Cluely. Architecture is studied; implementations
   are written here. NOTICE keeps the existing Clicky MIT attribution for
   the week-1 inspiration. No license is stripped.
2. **Four first-party desks, plus Today.** `teach` (screen walkthrough with POINT
   tokens, no floating identity), `meeting` (recap / assist / next steps
   from an armed transcript), `document` (Word coworker), `security`
   (review that cannot self-approve). `today` is the standing session
   brief (OpenWorker-shaped, original). An `inbox` id exists as a parked
   hint that names P-05; it never sends mail. Voice "spawn a coworker"
   queues a background brief and never claims `pointer-act`.
3. **Meeting assist is honest.** Capture-hidden HUD and on-device STT
   stay. Pointer is not an undetectable interview cheater. Recap/assist
   run locally from the transcript ring and do not Act. General /
   Transcribe / Meeting still cannot reach the driver.
4. **Online workspace is an artifact catalog, not a computer.** Public
   `host.netie.ai/workspace` lists desks and refuses `/exec`. Live
   artifacts and MCP stay on `127.0.0.1:18010`. `workspace.exec` is a
   first-party method that always errors. P-06 stays parked.
5. **First-party MCP grows, still closed.** Added tools:
   `desks.list`, `desks.pick`, `desks.ask`, `teach.point`, `teach.live`, `today.brief`,
   `meeting.live`, `security.review`, `security.live`, `inbox.live`,
   `document.live`, `session.live`, `workspace.list`,
   `workspace.get`, `workspace.put`, `workspace.exec` (always refuse).
   `teach.point` emits overlay tokens from injected measured controls only.
   `security.review` scans injected file bodies only and redacts hits.
   Unknown methods still refuse. No third-party MCP load. Public
   `workspace.get` / `?id=` stays on the laptop.

## Confirmation

`test/coworker.test.js`, `test/workspace.test.js`, plus the existing
`test/host-serve.test.js`, `test/mcp-abi.test.js`, and
`test/coordinator.test.js` extensions. Public `/mcp` and `/api/workspace/exec`
stay 404/refused. Meeting local assist returns `act: false`. Today brief
and coworker spawn return `act: false` and never claim `pointer-act`.
Live meeting pump is meeting/transcribe only. Public `?id=` is 404.
Measured teach emits `[BOX:]` from UIA rects. Meeting assist `cue` paints
in the fixed insight panel and copies via `hud:copyText` (never Act).
Live teach pump redraws measured overlays. Standing Today clock
republishes `standing-today`. Loopback `/meeting` and `/teach` are
coworker rooms; public `/api/meeting` and `/api/teach` are localFirst empty.
Security scans injected files only (redacted). Teach labels are numbered.
Teach Next cue and meeting say-this live in fixed HUD chrome. Recap chips
hand off to inbox/Word drafts (never send, never write without Cortex).
Teach overlay holds the current control; later measured boxes stay dashed; `got it` advances.
Loopback `/security` `/document` `/inbox` and `/api/home` are coworker
rooms; public copies are localFirst empty. Recap lists `## Decisions`.
Teach walks fields then the primary CTA (`Type in` before `Click Save`).
HUD shows `Then:` remaining steps. Overlay holds until `got it`. HUD
Back / Got it Ask the next step (never Act). Bare spawn runs the Today
plate. Recap labels You vs Them and tags a weekday when heard; say-this
is a speakable line from your answer. Meeting questions cue in 300ms. HUD
and loopback `/meeting` show `They asked` above say-this. Today plates
live commitments on loopback and stays empty on the public catalog.
Bare `write in Word` reuses the live recap or Today plate as a draft.
Loopback `/teach` paints a walk path (current BOX, later dashed). Public copies stay
empty. HUD Frame / Walk arms a teach walk of the framed region (Ask,
never Act); tray Frame stays capture for Act. Loopback `/teach` shows
`Then:` remaining steps. Empty UIA still boxes the framed region in
display percents (never invented control coords). Live Next / Then /
Got it stay in the top cue bar when chat is compact, and that bar
keeps They asked / last You/Them / Live system captions / Say this / Also / Don't say when the rest of HUD
hides (never a peek orb, never a stealth overlay). Meeting Heard lists
dates and amounts from the ring (`Friday / $40k`) plus clock times
(`3pm` / `15:00`) in HUD and `/meeting`.
Meeting spawn files inbox + Word follow-ons via `publishBrief` (never
Act, never jumps the HUD cue off They asked / Heard). Bare spawn during
Meeting/Transcribe recaps the call instead of the Today plate.
Say-this weaves Heard times and amounts into the speakable line; a date
or budget question with no answer still uses Heard facts (never invents).
Today plate lists filed inbox/Word drafts from that spawn.
Loopback `/` and `/workspace` show a This session catalog of those
artifacts (They asked / Heard / say-this / plate / file links). Public
copies stay empty. `workspace.exec` still always errors.
`session.live` is the loopback MCP read of that catalog (never exec).
Meeting spawn also files a security review of those injected bodies
(redacted, no disk, never self-approve).
Loopback `/teach` Back / Got it Ask the next measured step from a stored
walk (POST `/api/teach`, never Act, public copy 404). Copy next / Copy
say-this / Copy plate copy the cue line. Today plate lists your
commitments, not the meeting say-this dump.
Loopback host pages keep They asked / Heard / Next in sticky chrome
from `/api/home` (Back / Got it Ask, never Act). Public copies hide it.
Loopback `/meeting` Ask chips file inbox/Word drafts from the stored
transcript (POST `/api/meeting`, never Act, public copy 404). Teach
walks stay on `/teach`.
Loopback sticky chrome has a fixed Ask bar (POST `/api/ask`, never Act).
`desks.ask` is the MCP form of that Ask. `/today` chips file the same
way. `/workspace` opens a file as the working set (`id` on Ask, `this
file` scans only that body). This session file links are
`/workspace?id=` catalog opens (never exec). Loopback `/meeting` paints
a say-this answer card plus the You/Them talk track from the stored ring
(never a cheater overlay). An open workspace file grounds Heard facts
only, never talk. HUD insight paints the same talk in fixed chrome
(never a bubble).
Say-this / Also / Don't say is a grounded stack: your overlapping line or
Heard facts, never an unrelated last-you dump, never invent, never send.
OpenVault may refine say-this in 300ms; ungrounded or timed-out lines
keep the local heuristic. Never Act.
Loopback `/teach` paints a walk path from measured
BOX/POINT (current hold, later dashed, Got it Ask, never Act). Draw
around a control on that stage to stack numbered BOX regions in display
percents (never invented, cap 8). A click-through laptop overlay paints that
walk on the display when HUD hides, with fixed Next / Then / Back /
Got it Ask and Draw (freehand stroke, stored BOX) to stack a drawn step (never a buddy, never
meeting say-this). Current overlay BOX shows Click / Type in / Look at
(BOX tokens stay numbered). Loopback
`/` paints that teach path, meeting card, Today plate, and filed
inbox/Word/security work cards from `/api/home` (never exec).
HUD live cue bar paints last system STT lines as Live captions when
the rest of HUD hides (duplicate They asked / Them stay off; never a
floating LIVE bar). Compact HUD falls back to the stored meeting ring
when STT is quiet. Loopback host chrome paints the same Live captions
and shows Click/Type in on `/teach` (not `Next: 1 of 3`). Loopback `/workspace` This computer dock Run POSTs `/api/workspace/exec`
and always fails closed (P-06). Public catalog shows the same refuse.
Loopback GET `/api/document.docx` returns a generated Word package from
the live draft (never Act, never Word.app). Public `/api/document.docx`
stays 404. Cue still says not a .docx. Loopback GET `/api/inbox.eml`
returns an unsent RFC822 draft (never send). Public `/api/inbox.eml`
stays 404. Cue still says not sent.
Public POST
`/api/ask` stays 404.
