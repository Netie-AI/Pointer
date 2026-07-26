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
| Live mic capture | ✅ | `getUserMedia` → 16 kHz worklet → main (`hud-audio.js`) |
| **System audio capture** | ✅ | Native Electron WASAPI **loopback** — no sidecar. Verified track label `"System audio"` |
| Utterance gating | ✅ | `netie/audio.js` adaptive floor + hangover; `minMs` counts voiced audio only |
| STT engine chain | ✅ | whisper.cpp → OpenVault `/v1/audio/transcriptions` → sidecar → **Windows dictation (zero install)** → honest "none" |
| Works out of the box | ✅ | `netie/winspeech.js` persistent worker; 158–559 ms warm. Rough output flagged `rough` and shown italic |
| Ask + Do it | ✅ | HUD Ask AI / Do it → same Cortex-gated paths |
| Tests | ✅ | 83 passing incl. `audio.test.js`, `transcriber.test.js` |

### Removed on purpose: Chromium SpeechRecognition

Probed on Electron 35.7.5 — reaches `audiostart`, then **`error: "network"`** at ~3.8 s (Electron ships no Google Speech key), and the old `onend` handler restarted it forever. It is also **cloud**, not on-device, which contradicts our governance. Replaced by the local engine chain above; see `docs/TRANSCRIPTION.md`.

## Still open (not blocking local zen)

1. Cortex `/v1/telemetry` + `/register` live endpoints (Cortex lane).
2. OpenVault custody inject for secret fields.
3. **Better STT accuracy is opt-in**: Windows dictation works with zero install but mishears (~0.5 confidence typical). Set `NETIE_WHISPER_BIN` + `NETIE_WHISPER_MODEL` for a real jump — see `docs/TRANSCRIPTION.md`.

## Ops

```powershell
npm test
$env:NETIE_CLICK_DRY_RUN=1; npm start   # no real clicks
npm start                               # real clicks after Approve
```

Conversations folder (Explorer / Netie Space):
`%APPDATA%\NetieClicks\conversations\`
