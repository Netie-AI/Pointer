# Live transcription for Netie Clicks (Windows)

## Pick for Netie

| Priority | Repo | Why |
|---|---|---|
| **1. Engine (CPU)** | [KoljaB/RealtimeSTT](https://github.com/KoljaB/RealtimeSTT) | Best *library* for low-latency streaming mic STT; VAD; faster-whisper backends; easy to wrap as a localhost sidecar. |
| **2. Native core** | [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) `examples/stream` | Gold-standard local Whisper; CPU-friendly tiny/base models; use when we ship a binary worker. |
| **3. Windows system audio** | [parkscloud/Hearsay](https://github.com/parkscloud/Hearsay) | Mic **+ WASAPI loopback** (what speakers play) on Windows with faster-whisper — closest to Cluely’s “hear the call”. |
| **4. Electron+loopback pattern** | [judah3/LoKal-liveTranscript](https://github.com/judah3/LoKal-liveTranscript) | Architecture twin: Electron UI + Python faster-whisper + C# WASAPI — copy the IPC shape. |
| **5. Stream CLI** | [bevsxyz/WhisperForge](https://github.com/bevsxyz/WhisperForge) | Production-minded `wforge stream` with Silero VAD + LocalAgreement commits. |

Topic page: [github.com/topics/real-time-transcription](https://github.com/topics/real-time-transcription)

## What Netie Clicks ships now

**Capture is solved natively; only the engine is pluggable.**

1. **Mic + Windows system audio, no sidecar for capture.** `electron/hud-audio.js` — mic via `getUserMedia`, speakers via `getDisplayMedia` + Electron `audio: 'loopback'` (WASAPI).
2. **16 kHz mono pipeline** + adaptive VAD in `netie/audio.js`.
3. **Engine chain** (`netie/transcriber.js`) — privacy-first, all on-device:

   | # | Engine | Install | Notes |
   |---|--------|---------|-------|
   | 1 | `whisper-cli` | whisper.cpp + **multilingual** model (`-l auto`) | Best offline |
   | 2 | `sidecar` | `npm run stt` → `:8766` faster-whisper | **Default for Malaysian rojak** (zh/en/ms) |
   | 3 | `openvault` | OpenVault `:5000` | Same gateway as chat |
   | 4 | `windows-speech` | none | Rough floor |
   | 5 | `none` | — | Typed Ask/Act still work |

4. App auto-spawns `scripts/stt_sidecar.py` on start (set `NETIE_STT_AUTOSTART=0` to disable).

### Malaysian / Singaporean rojak

Use a **multilingual** Whisper model (not `*.en`). Sidecar sets `multilingual=True`, `condition_on_previous_text=False`, `language=auto`. Transcripts keep each language as spoken (Chinese characters, English, Malay) for note-taking.

**Accuracy test (say these, mark right/wrong):**
1. "Open the settings window"
2. "帮我 copy 这段到 Cursor"
3. "Jom meeting — I share screen dulu"
4. "Transcribe mode" / "Meeting mode"

Later GPU (12GB): `$env:NETIE_STT_DEVICE='cuda'; $env:NETIE_STT_MODEL='medium'` then `npm run stt`.

### Why Chromium `SpeechRecognition` is NOT used

It looks free but is unusable here, on two counts we verified rather than assumed:

- **It does not work in Electron.** Probing Electron 35.7.5, it reaches `audiostart` then dies at ~3.8 s with `error: "network"`. Electron ships no Google Speech API key. The HUD's old `onend` handler restarted it on failure, producing an invisible infinite mic-open/fail/retry loop.
- **It is not on-device.** In Chrome it streams microphone audio to Google's servers. For a product whose governance is "personal brain on device, dual-envelope crypto, users never manage keys", silently shipping the user's microphone off-box is disqualifying regardless of whether it functions.

Reproduce: `node test/audio.test.js`, and the probes under `docs/` history.

## Local engine (fully offline, recommended)

Point Netie at a whisper.cpp build and a model; it is then preferred over everything else:

```powershell
$env:NETIE_WHISPER_BIN   = "C:\tools\whisper\whisper-cli.exe"
$env:NETIE_WHISPER_MODEL = "C:\tools\whisper\ggml-base.en.bin"
npm start
```

`ggml-tiny.en` (~75 MB) is enough for command phrasing; `base.en` (~142 MB) is noticeably better on accents. Both run on CPU.

## Recommended sidecar (later install)

```powershell
pip install RealtimeSTT faster-whisper
# then run a thin FastAPI/Flask that POSTs partials to Netie, or expose NETIE_STT_URL
```

For **system audio on Windows**, a sidecar is *not* required: Electron's own `setDisplayMediaRequestHandler({ audio: 'loopback' })` is WASAPI loopback and is what Clicks now uses. Hearsay / LoKal remain useful only if you want their *engines* (faster-whisper) rather than their capture — wire either behind `NETIE_STT_URL` and it slots into the chain as the `sidecar` engine.
