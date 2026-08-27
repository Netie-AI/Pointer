# Product surface (Netie Pointer)

One UI: center HUD chat with retrieve roulette and a draggable audio dock.

Coworker desks (DR-0005): Teach points at measured on-screen controls
(UIA rects -> numbered `[POINT:x,y:n label]` and `[BOX:left,top,w,h:n label]`,
never invented), Meeting recaps an armed transcript (commitments plus a
live say-this cue while a question is still open), Today is the standing
session brief, Document can reuse the live meeting recap as a Word draft,
Security reviews injected files and never self-approves. Teach Next cue
and meeting say-this live in the fixed insight panel. HUD desk chips Ask,
never Act. `/today` and
home paint the brief. Loopback `/meeting` and `/teach` are coworker rooms.
Loopback host pages poll while live. Online `/workspace`
is a read-only artifact catalog with a filter. "Spawn a coworker" queues a
background brief and never Acts. Act stays on the laptop.

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
