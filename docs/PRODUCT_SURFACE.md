# Product surface (Netie Pointer)

One UI: center HUD chat with retrieve roulette and a draggable audio dock.

| Action | Result |
|---|---|
| `npm start` | Tray-first launch (HUD stays hidden until needed) |
| Ctrl+` | Toggle session and open HUD |
| Frame | Full-screen drag box, then return to HUD |
| Hold Clicky / Ctrl+Shift+Space | Cursor mode for screen agent flow |
| Retrieve | Roulette for Chat, Notes, Assets, Memory |

Approval stays in HUD: nod / Affirm / Ctrl+Y.

## Windows-safe visual direction

No `backdrop-filter` in core HUD surfaces (Windows Electron corruption risk). Netie Pointer uses solid frosted panels, spring-style transitions, and press-on-down feedback.

## Lag stance

Default launch avoids idle-heavy work:
- no automatic HUD show
- no automatic STT sidecar spawn
- no automatic recall daemon when idle
- mic starts only when explicitly enabled
