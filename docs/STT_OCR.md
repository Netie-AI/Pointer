# STT / OCR refresh (EPIC-P04)

## Measure first

```powershell
node scripts/stt_baseline.js
```

Records which engine `transcriber.js` picks and whether `NETIE_STT_URL` is set.

## OpenWillow

- Separate app at `D:\OpenWillow` (Deepgram-oriented Tauri).
- Pointer integration: HTTP sidecar compatible with existing chain slot `sidecar` via `NETIE_STT_URL`.
- Do **not** vendor the whole app (GPLv3 + cloud default) — see `PARKING_LOT.md` P-04.

## TurboOCR

- https://github.com/aiptimizer/TurboOCR — **screen OCR**, not speech.
- Only after STT baseline is healthy and HUD lag is still OCR-bound (`PARKING_LOT.md` P-03).
