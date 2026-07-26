# Netie Clicks — wiring status

Branch `netie-ecosystem-contracts`.

## Zen scorecard

| Surface | Status | Notes |
|---|---|---|
| Cortex gate + OpenVault vision | ✅ | fail-closed on act |
| One-tap **Go** | ✅ | intent ask/act |
| Plan review + Run | ✅ | irreversible unchecked |
| **Real input driver v2** | ✅ | one persistent Win32 SendInput worker — ~12 ms/op warm (was ~2 s/op); dry-run env |
| Wheel scroll + key combos | ✅ | real `MOUSEEVENTF_WHEEL`; `ctrl+s`-style combos, a–z/0–9/F1–F12 |
| DPI / multi-monitor | ✅ | per-monitor-DPI-aware worker + `dipToScreenPoint`; overlay/capture follow the cursor's display (`geometry.js`) |
| Vision targeting | ✅ | `targeting.js` fills xPct/yPct when missing — now also for type/fill (click-to-focus before typing) |
| Kill switch | ✅ | Ctrl+Space always; Esc grabbed **only while a plan runs** (no system-wide Esc hijack) |
| Memory-aware plans | ✅ | hot + personal brain into `_llmPlan` |
| Post-step verify | ✅ | fresh pre-action fingerprint (not plan-time stale); stop on no change |
| Custody client | ✅ | `requestCustody` → `/v1/custody/inject` (soft-fail until OV ships) |
| Hot ticks | ✅ | foreground sampling rides the driver worker — no powershell spawn per tick |
| Cluely HUD | ✅ | Top bar + Live insights + AI response + cute FAB (`hud.html`, content-protected) |
| Ctrl+Space default | ✅ | Full-screen capture immediately; **Frame** for optional region |
| Live mic STT | ✅ | Chromium SpeechRecognition in HUD |
| System audio STT | ✅ contract | Sidecar `NETIE_STT_URL` — see `docs/TRANSCRIPTION.md` (Hearsay / RealtimeSTT) |
| Ask + Do it | ✅ | HUD Ask AI / Do it → same Cortex-gated paths |
| Tests | ✅ | includes `stt.test.js` |

## Still open (not blocking local zen)

1. Cortex `/v1/telemetry` + `/register` live endpoints (Cortex lane).
2. OpenVault custody inject for secret fields.
3. Ship bundled RealtimeSTT/Hearsay sidecar for system-audio (optional install).

## Ops

```powershell
npm test
$env:NETIE_CLICK_DRY_RUN=1; npm start   # no real clicks
npm start                               # real clicks after Approve
```

Conversations folder (Explorer / Netie Space):
`%APPDATA%\NetieClicks\conversations\`
