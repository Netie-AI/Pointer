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
woven in, Heard facts from an open workspace file, a Heard strip from
the ring, a say-this / Also / Don't say stack on loopback `/meeting` and in HUD
insight (grounded Heard only, never invent, never send), and a 300ms cue when they ask), Today
is the standing session brief with On your plate from live commitments
and filed inbox/Word drafts,
Document reuses the live recap or Today plate on a bare `write in Word`
(still not a `.docx` in Word.app without Cortex; loopback `/document`
may download a generated package, never Act), Security
reviews injected files and never self-approves.
Teach overlay holds the current control until `got it`. Fixed HUD chrome
has Back / Got it (Ask, never Act) in the top cue bar even when chat is
closed, plus in the insight panel when chat is open. That cue bar
keeps They asked / last You/Them / Live captions (STT or stored ring) / Say this / Also / Don't say when the rest of HUD
hides. Teach cue is Click/Type in on the current BOX (not only `N of M`). Recap tags a weekday when heard. Teach Next cue, meeting say-this, and
security Review live in the fixed insight panel. HUD desk chips Ask,
never Act. Home `/api/home` lists live rooms for every desk. Loopback
`/` and `/workspace` show a This session catalog (They asked / Heard /
filed inbox and Word links, no runtime). Loopback `/` also paints the live
teach path, meeting say-this card, Today plate, and filed inbox/Word/security
work cards. `/meeting` paints a Live answer (They asked / last You/Them /
Live captions / say-this). Loopback host pages keep They asked / Heard / Live captions /
Click/Type in in sticky chrome
(Back / Got it Ask, never Act). `/teach` chrome is teach-only. Loopback
`/teach` draws a read-only box map from measured markers and Back / Got
it Ask the next step on loopback (never Act). A tap inside the current BOX
is Got it (Ask, never Act). Draw around a control to
stack a BOX and keep the freehand stroke on the walk. Copy next / Copy say-this
copy the cue line. Overlay current BOX shows Click / Type in / Look at
plus field / button faces at those measured percents (not only `1 Save`).
OS voice speaks Click/Type in on the current BOX (overlay, HUD, `/teach`);
never meeting. Current BOX pulses in place (not a cursor ring).
Loopback `/meeting` Ask chips file an unsent follow-up
and a Word draft from the stored transcript (never send, never Word.app,
teach walks stay on `/teach`). Loopback sticky chrome has a fixed Ask bar
on every page (`/api/ask`, never Act). `/today` chips file Recap / mail /
Word / security the same way. Loopback `/workspace` opens a file as the
working set and Ask chips review/file from that body (`this file` scans
only the open artifact). This session links open `/workspace?id=` as
the working set (never exec). `/workspace` This computer dock Run POSTs
`/api/workspace/exec` and always fails closed (P-06). Opening a live
document or inbox file on `/workspace?id=` also offers Download generated
`.docx` / unsent `.eml` and hoists that file above desks and Run, with
This session files as tabs. Opening `live-security` offers Download review
(never approval). Download packet on home/`/workspace` is loopback GET
`/api/session.zip` (finished files, never exec). `/workspace` This computer
paints those files as a desktop grid (click to open, Run still refused).
Opening a Teach walk paints This screen. Opening a Meeting paints the
Live answer. Opening a Word file paints Notes (paper skips recap metadata). Opening
unsent mail paints a compose window whose To is a Heard name or not
sent (never invent, never send). Opening a review paints Needs you
(never approve). Loopback `/document` `/inbox` `/security` paint the
same windows. Home theater paints those windows on the rail and a room
dock of links (no markdown dump). Session markdown stays copy-only. The
desks catalog lives on `/workspace`. `?demo=1` is a sample coworker catalog
(not live, no runtime).
Loopback `/document`
downloads a generated `.docx` from the live draft (never Act, never
Word.app). Public `/api/document.docx` is 404. Loopback `/meeting` paints the You/Them
talk track from the stored ring. HUD insight paints the same You/Them
turns in fixed chrome. Say-this reuses your overlapping line
or Heard facts, never an unrelated last-you dump. Loopback `/teach`
paints a large walk stage from measured BOX/POINT (Next/Then on the
stage, Got it Ask, never Act). This screen shows field / button faces
at those measured percents. Today plate lists your commitments, not the meeting
say-this dump. Inbox never
sends (P-05); loopback `/inbox` may download a generated `.eml` (never send).
Public `/api/inbox.eml` is 404. Security never self-approves; loopback
`/security` may download a generated review. Public `/api/security.md` is 404. "Spawn a coworker" runs the named job, or the Today plate
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
