# Netie Clicks — Full Product Plan

Standalone app at `D:\Netie Clicks` (not inside OpenVault).
Inspired by MIT [farzaa/clicky](https://github.com/farzaa/clicky) (`D:\OpenVault\vendor\clicky`).
LLM + keys via OpenVault `http://127.0.0.1:5000` — **no Cloudflare Worker**.

---

## Interaction model (what you asked for)

| Gesture | Behavior |
|---|---|
| **Hold Ctrl+Space** | Arm session — start short-term sensing (ticks) |
| **Drag frame** (while armed) | Rubber-band region → screenshot that crop |
| **Release / chat** | Instruct Netie (“click that”, “fill the form…”) with region + hot memory |
| **Continuous capture** | While ACTIVE: burst frames (~2 fps for a few seconds) + NLP ingest |
| **Hot memory** | Last **60 seconds only** in Redis (or in-process ring if Redis down) |
| **Cold memory** | Parsed action summaries → SQLite on disk |

### Hot tick contents (every ~250 ms while armed)

- Cursor `x,y` + display id + DPI scale
- Foreground window title + process name
- Optional: UIA hover name/role (week 2)
- Optional: browser URL if detectable (week 2)
- Frame id / path if a burst shot was taken

### Redis schema (hot)

```
ov:clicks:ticks:{device_id}   ZSET  score=unix_ms  member=tick_json
  → ZREMRANGEBYSCORE keep now-60000 on every write
ov:clicks:session:{id}        HASH  state, region, started_ms
ov:clicks:active:{device_id}   STRING session_id  TTL 90s
```

Do **not** put JPEG blobs in Redis — temp files under `%TEMP%\netie-clicks\`.

### Cold SQLite

`%APPDATA%\NetieClicks\memory.db` — sessions + action summaries only.

---

## Week cut

### Week 1 (this tree — ship now)

- [x] Standalone repo at `D:\Netie Clicks`
- [x] Tray Electron app
- [x] **Ctrl+Space** global shortcut (toggle arm; hold-to-talk native hook week 1.5)
- [x] Region frame overlay (drag to crop)
- [x] Chat panel instruct → OpenVault `/v1/chat/completions` + vision
- [x] In-process 60s ring memory (Redis client when `OPENVAULT_REDIS_URL` set)
- [ ] Native `WH_KEYBOARD_LL` hold/release (replace toggle)

### Week 2

- Continuous NLP ingest endpoint on OpenVault
- POINT overlay (`[POINT:x,y:label]` from Clicky)
- UIA hover + browser URL
- Voice PTT + TTS
- Real WebAuthn passkeys for host (OpenVault)

---

## Run

```powershell
# OpenVault API must be up
cd D:\OpenVault\OpenMW
uv run openmw console --host 127.0.0.1 --port 5000 --no-open-browser

# Netie Clicks
cd "D:\Netie Clicks"
npm start
```

**Ctrl+Space** → overlay → drag a region → type instruct → Ask.

---

## License note

Clicky vendor sources are MIT (Farza). Netie Clicks is a Windows reimplementation; include MIT attribution in NOTICE.
