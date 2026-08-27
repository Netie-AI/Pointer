# Product surface (Netie Pointer)

One UI: center HUD chat with retrieve roulette and a draggable audio dock.

Coworker desks (DR-0005): Teach points at measured on-screen controls
(UIA rects -> numbered `[POINT:x,y:n label]` and `[BOX:left,top,w,h:n label]`,
never invented; overlay holds the current control and dashes later
measured boxes; fields then primary
CTA; `Type in` / `Click` cue; `Then:` remaining steps; say `got it` to
advance), Meeting recaps an
armed transcript (You/Them lines, weekday tags, They asked chrome, a
speakable say-this from your answer with Heard dates/amounts/clock times
woven in, a Heard strip from
the ring, and a 300ms cue when they ask), Today
is the standing session brief with On your plate from live commitments
and filed inbox/Word drafts,
Document reuses the live recap or Today plate on a bare `write in Word`
(still not a `.docx` without Cortex), Security
reviews injected files and never self-approves.
Teach overlay holds the current control until `got it`. Fixed HUD chrome
has Back / Got it (Ask, never Act) in the top cue bar even when chat is
closed, plus in the insight panel when chat is open. Teach cue is
`N of M Click Save`. Recap tags a weekday when heard. Teach Next cue, meeting say-this, and
security Review live in the fixed insight panel. HUD desk chips Ask,
never Act. Home `/api/home` lists live rooms for every desk. Loopback
`/` and `/workspace` show a This session catalog (They asked / Heard /
filed inbox and Word links, no runtime). Loopback host pages keep They asked / Heard / Next in sticky chrome
(Back / Got it Ask, never Act). Loopback
`/teach` draws a read-only box map from measured markers and Back / Got
it Ask the next step on loopback (never Act). Copy next / Copy say-this
copy the cue line. Loopback `/meeting` Ask chips file an unsent follow-up
and a Word draft from the stored transcript (never send, never a `.docx`,
teach walks stay on `/teach`). Loopback sticky chrome has a fixed Ask bar
on every page (`/api/ask`, never Act). `/today` chips file Recap / mail /
Word / security the same way. Loopback `/workspace` opens a file as the
working set and Ask chips review/file from that body (`this file` scans
only the open artifact). This session links open `/workspace?id=` as
the working set (never exec). Loopback `/meeting` paints the You/Them
talk track from the stored ring. HUD insight paints the same You/Them
turns in fixed chrome. Say-this reuses your overlapping line
or Heard facts, never an unrelated last-you dump. Loopback `/teach`
paints a large walk stage from measured BOX/POINT (Next/Then on the
stage, Got it Ask, never Act). Today plate lists your commitments, not the meeting
say-this dump. Inbox never
sends (P-05). "Spawn a coworker" runs the named job, or the Today plate
when bare (a meeting/transcribe session recaps instead, and files an
unsent follow-up, a Word draft, and a security review of those injected
bodies). Loopback MCP `session.live` reads the This session catalog.
Never Acts. Act stays on the laptop.

| Action | Result |
|---|---|
| `npm start` | Tray-first launch (HUD stays hidden until needed) |
| Ctrl+` | Toggle session and open HUD |
| Frame | Full-screen drag box, then return to HUD |
| Hold Clicky / Ctrl+Shift+Space | Cursor mode for screen agent flow |
| Retrieve | Roulette for Chat, Notes, Assets, Memory |

Approval stays in HUD: nod / Affirm / Ctrl+Y.

## Visual refs (command bar / onboard / status pills)

See [`docs/ui-refs/perplexity-computer/INDEX.md`](ui-refs/perplexity-computer/INDEX.md) before HUD or onboard CSS changes.

## STT / OCR

Baseline probe: `node scripts/stt_baseline.js`. Notes: [`docs/STT_OCR.md`](STT_OCR.md).

## Windows-safe visual direction

No `backdrop-filter` in core HUD surfaces (Windows Electron corruption risk). Netie Pointer uses solid frosted panels, spring-style transitions, and press-on-down feedback.

## Lag stance

Default launch avoids idle-heavy work:
- no automatic HUD show
- no automatic STT sidecar spawn
- no automatic recall daemon when idle
- mic starts only when explicitly enabled
