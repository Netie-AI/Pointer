# Product surface (Netie Pointer)

One UI: center HUD chat with retrieve roulette and a draggable audio dock.

Coworker desks (DR-0005): Teach points at measured on-screen controls
(UIA rects -> numbered `[POINT:x,y:n label]` and `[BOX:left,top,w,h:n label]`,
never invented; overlay shows the current step only; fields then primary
CTA; `Type in` / `Click` cue; `Then:` remaining steps; say `got it` to
advance), Meeting recaps an
armed transcript (You/Them lines, weekday tags, They asked chrome, a
speakable say-this from your answer, and a 300ms cue when they ask), Today
is the standing session brief with On your plate from live commitments,
Document reuses the live recap or Today plate on a bare `write in Word`
(still not a `.docx` without Cortex), Security
reviews injected files and never self-approves.
Teach overlay holds the current control until `got it`. Fixed HUD chrome
has Back / Got it (Ask, never Act). Teach cue is `N of M Click Save`. Recap
tags a weekday when heard. Teach Next cue, meeting say-this, and
security Review live in the fixed insight panel. HUD desk chips Ask,
never Act. Home `/api/home` lists live rooms for every desk. Loopback
`/teach` draws a read-only box map from measured markers. Inbox never
sends (P-05). "Spawn a coworker" runs the named job, or the Today plate
when bare, and never Acts. Act stays on the laptop.

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
