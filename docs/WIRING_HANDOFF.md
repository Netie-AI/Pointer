# Netie Pointer — wiring status

Branch `netie-ecosystem-contracts`.

## Zen scorecard

| Surface | Status | Notes |
|---|---|---|
| Cortex gate + OpenVault vision | ✅ | fail-closed on act |
| One-tap **Go** | ✅ | intent ask/act/code |
| **Idiot-proof recipes** | ✅ | copy/paste/fill left·right/merge/save skip LLM |
| Plan review + Run | ✅ | irreversible unchecked |
| **Real input driver v3** | ✅ | drag, clipboard set/get/paste, open/navigate + SendInput |
| Wheel scroll + key combos | ✅ | real `MOUSEEVENTF_WHEEL`; `ctrl+s`-style combos |
| DPI / multi-monitor | ✅ | per-monitor-DPI-aware worker + `dipToScreenPoint` |
| Vision targeting | ✅ | `targeting.js` fills xPct/yPct when missing |
| Kill switch | ✅ | Ctrl+` always; Esc only while plan runs |
| Memory-aware plans | ✅ | hot + personal brain into `_llmPlan` |
| Post-step verify | ✅ | fresh pre-action fingerprint |
| Custody client | ✅ | soft-fail until OV ships inject |
| **Agent presence** | ✅ | crazy smile + matrix rain while working |
| **Clicky hold mode** | ✅ | hold topbar / Ctrl+Shift+Space → cursor overlay |
| **Recall 60s ring** | ✅ | gated by active session or Clicky; dual-wrap on eviction; sealed files expire with the ring |
| **Finite horizon** | ✅ | `NETIE_MAX_STEPS` (default 24) |
| **Light mode** | ✅ | `NETIE_LIGHT=1` disables systemAudio/canvas/hotTicks |
| Dual vault + consent purge | ✅ | opt-out purges queue + clears fleet KEK |
| **Cortex `/v1/telemetry`** | ✅ | register + opaque envelope store (Cortex lane) |
| Pointer HUD + STT chain | ✅ | whisper → OV → sidecar → Win dictation |
| Tests | ✅ | recipes + presence + driver v3 |

## Still open (not blocking local zen)

1. OpenVault custody inject for secret fields.
2. Accessibility-tree targeting (Orca-style) — coords remain fallback.
3. Better STT accuracy is opt-in (`NETIE_WHISPER_*`).
4. Recall pixel seal to disk is env-gated (`NETIE_RECALL_PIXELS=1`) — RAM ring always on.

## HUD (liquid glass chat)

Central draggable chat flies into the middle. Transcript on the left rail. Mic + system audio are icon-only in a bottom-right dock. Enter sends; Ctrl+Enter newline. ⋯ menu opens **below** the dots. Themes: dark / light / gra. `setContentProtection(true)` keeps the HUD out of normal screenshots/share (not a kernel rootkit — DWM protection).

| Piece | Behaviour |
|---|---|
| **Hold Clicky** (topbar) ≥180ms | Cursor becomes Netie smile orb (follows pointer) |
| **Ctrl+Shift+Space** | Toggle Clicky |
| **Recall daemon** | 1 Hz thumbs (2 Hz if `NETIE_LIGHT=1`), 60s ring |
| **Vault** | Evicted frames dual-wrapped; pixels only with `NETIE_RECALL_PIXELS=1` |
| **Planner** | Gets last ~60s cursor/app summary as memory |

Esc layers: menu → ask → Clicky exit → hide HUD.

## Ops

```powershell
npm test
$env:NETIE_CLICK_DRY_RUN=1; npm start   # no real clicks
$env:NETIE_LIGHT=1; npm start           # laptop-friendly
npm start                               # real clicks after Approve / auto-run
```

Say **copy**, **paste**, **fill right**, **merge cells** — Go runs the recipe immediately.
