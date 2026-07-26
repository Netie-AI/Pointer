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

1. **Instant mic** — Chromium `SpeechRecognition` / `webkitSpeechRecognition` in the HUD (OS speech, CPU-side, zero model download). Good for “speak to ask”.
2. **Optional sidecar** — `NETIE_STT_URL` (default `http://127.0.0.1:8766`) JSON/SSE bridge for RealtimeSTT or Hearsay-style workers; system-audio toggle calls `/start?source=system|mic|both`.
3. **Fallback** — if neither works, HUD still accepts typed Ask / Act.

## Recommended sidecar (later install)

```powershell
pip install RealtimeSTT faster-whisper
# then run a thin FastAPI/Flask that POSTs partials to Netie, or expose NETIE_STT_URL
```

For **system audio on Windows**, prefer Hearsay’s WASAPI loopback or LoKal’s C# capture — browser APIs cannot capture speaker output safely.
