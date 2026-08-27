# Product surface (Netie Pointer)

One UI: center HUD chat with retrieve roulette and a draggable audio dock.

Coworker desks (DR-0005): Teach points at the screen, Meeting recaps an armed
transcript, Today is the standing session brief, Document writes Word, Security
never self-approves. `/today` paints that brief. Online `/workspace` is an
artifact catalog. "Spawn a coworker" queues a background brief and never Acts.
Act stays on the laptop.

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
