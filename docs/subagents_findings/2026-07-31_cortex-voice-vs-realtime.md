---
keywords: [voice, realtime, VAD, gemini-live, privacy]
main_idea: Beat GPT-Realtime demos with local VAD + governed Act + PII mask; cloud duplex is backup behind NETIE_VOICE_CLOUD=1 only.
---

# R7 — Voice vs GPT-Realtime 2.0

- Cortex has no WebSocket audio session today (SSE text only).
- HeyClicky streams mic to OpenAI — privacy + cost weakness.
- **Netie win:** arm hotkey, local STT (faster-whisper), Cortex secure, Gemini primary via OpenVault, optional Gemini Live backup flag.
- Scaffold: `voice_session.py` / `voice_routes.py` (C-VOICE-01).
