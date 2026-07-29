# Netie Pointer modes & agentic behaviour

## Modes

| Mode | How | Chrome | Notes |
|---|---|---|---|
| **Agent** (default) | UI / “agent mode” | Full HUD | Ask + Do, auto-run sensible |
| **Transcribe** | UI / “transcribe mode” | Thin top bar | Auto markdown under `%APPDATA%\NetieClicks\notes\` |
| **Meeting** | UI / “meeting mode” | Lite insights | Same notes + quieter chrome |

Desktop stays clickable (HUD click-through). Hover chrome to interact.

## Auto-run + nod

- **Auto-run sensible** (⋯ settings, default ON): non-irreversible clicks/types/copy-paste run immediately — no Enter.
- **Idiot-proof recipes**: say `copy`, `paste`, `fill right`, `fill left`, `merge cells`, `save` — Go skips the LLM and runs hotkeys.
- **Nod confirm** (default ON): irreversible (Buy/Send/Delete) or mixed plans wait for:
  - voice: yes / ok / go / 可以 / 好
  - **Ctrl+Y** or Affirm button
- Irreversible + secrets still Cortex-gated / custody. **No raw kernel access.**

## Agent presence

While working: crazy smile orb + soft matrix rain on the stage. Cursor bubble highlights active steps.

## Clicky (screen agent)

| Action | Result |
|---|---|
| **Hold Clicky** ≥180ms | Cursor becomes Netie; ask opens |
| **Ctrl+Shift+Space** | Toggle Clicky |
| Esc (when Clicky on) | Exit Clicky first, then hide |

Background **Recall** runs only while session is active or Clicky is armed: rolling 60s thumbs + cursor + foreground window. Evicted frames dual-wrap into the vault. Pixel seal to disk needs `NETIE_RECALL_PIXELS=1`.

## Review canvas

Tray → **Review canvas**, or HUD ⋯ → Review canvas. Browse **Today / All / Notes**, markdown rendered with code fences. Each session tagged:

```
> product: Netie Pointer
> airgpt_id: Pointer-2026-07-26
> session_kind: agent|coding|ask|notes
```

Wire AirGPT / Netie Space to `%APPDATA%\NetieClicks\conversations\` (and `notes\`).

## Coding answers

Intent `code` → full fenced Python + optional local `py -3.12` check (`runPythonChecks`).

## STT (Malaysian rojak)

```powershell
npm run stt
# sidecar starts lazily on first mic/system-audio enable → http://127.0.0.1:8766
# GPU later: $env:NETIE_STT_DEVICE='cuda'; $env:NETIE_STT_MODEL='medium'
```

Mic + System audio toggles on the top bar. Engine: faster-whisper multilingual (`language=auto`).

## Safety stance

Cortex gate → plan → auto/nod/approve → Win32 driver → audit. Full laptop control is **agentic through Cortex**, not an ungated kernel hook.
