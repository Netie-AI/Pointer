# Netie Pointer

Netie Pointer is the screen-native Netie surface for desktop execution: fast ask/act flow, retrievable session memory, and voice-first operation.

## Product intent

- Cluely-class center overlay for real-time desktop help
- One control surface for Agent, Transcribe, and Meeting modes
- Retrieval-first UX through a circle roulette (Chat, Notes, Assets, Memory)
- AirGPT-aligned output format for desktop and mobile continuity

## Retrieval model (GTA-style)

- Chat histories: `%APPDATA%\NetieClicks\conversations\`
- Notes and transcripts: `%APPDATA%\NetieClicks\notes\`
- Assets: recall ring thumbnails and screen-context metadata
- Memory: recent hot ticks and short summaries for plan context

## Performance baseline

Phase 1 removes idle lag by default:
- tray-first startup (HUD hidden)
- lazy STT sidecar startup
- recall daemon only while session/Clicky is active
- mic/system audio off until explicit user action
- lower-cost recall ring and reduced wave paint churn

## Apple design translation for this HUD

- Instant response on pointer-down actions
- Interruptible spring-like panel motion and wheel transitions
- Layered frosted solids for depth (Windows-safe, no mandatory backdrop blur)
- Typography with tighter display tracking and clear hierarchy
- Reduced-motion fallback using fades and minimal transforms

## Safety and checks

- Auto-run sensible actions stays configurable
- Irreversible actions remain nod/affirm/custody gated
- Python checks remain explicit and opt-in
- STT status exposed in HUD and settings flow

## Phase 2 native acceleration (only if still laggy)

- Native DXGI/WGC recall thumbnail sidecar (Rust) to replace high-frequency `desktopCapturer` calls
- `whisper.cpp`/GPU-backed STT path for lower-latency multilingual streaming
- Keep Electron shell unless profiling proves shell overhead is the bottleneck
