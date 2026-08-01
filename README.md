# Netie Clicks

Standalone Windows screen buddy at `D:\Netie Clicks`.

MIT Clicky reference: `D:\OpenVault\vendor\clicky` ([farzaa/clicky](https://github.com/farzaa/clicky)).
LLM + keys: OpenVault `http://127.0.0.1:5000` (no Cloudflare worker).

## Run

```powershell
# 1) Cortex engine (required for Act — fail-closed gate)
powershell -ExecutionPolicy Bypass -File D:\Cortex\scripts\start_cortex_engine.ps1 -Port 8010 -Pack dms

# 2) OpenVault API (LLM + vision)
cd D:\OpenVault\OpenMW
$env:CORTEX_URL = "http://127.0.0.1:8010"
uv run openmw console --host 127.0.0.1 --port 5000 --cortex-url http://127.0.0.1:8010 --no-open-browser

# 3) Netie Pointer
cd "D:\Netie Clicks"
npm start
```

Health checks: `http://127.0.0.1:8010/health`, `POST /dms/secure` with steward key, OpenVault `:5000`.

Dry-run (no real clicks): `$env:NETIE_CLICK_DRY_RUN=1; npm start`

## Use

1. **Ctrl+`** — arm session (hot ticks + capture-hidden stage)
2. **Drag** a rectangle — region screenshot
3. Type what you want → **Go** (ask or act — we decide)
4. Watch **bubbles + bottom subtitles** (hidden from screen capture)
5. **Save chat** / **Folder** / **Space** — markdown under `%APPDATA%\NetieClicks\conversations`

Demo rehearsal: Ask “what’s on screen?” → Act “type Hello from Netie” → “save”.

## Docs

- `ECOSYSTEM.md` — peers (Cortex + OpenVault)
- `docs/SAFETY.md` / `docs/CONTRACTS.md` / `docs/DATA_GOVERNANCE.md` — threat model + learning rules
- `FULL_PLAN.md` — product + Redis schema + week cut
- `ARCHITECTURE.md` — Clicky → Electron map
- `NOTICE` — MIT attribution

## Tests

```powershell
npm test
```

## Env

| Var | Default |
|---|---|
| `NETIE_CLICK_HOTKEY` | `Control+`` |
| `NETIE_CLICK_MODEL` | `gpt-4o-mini` |
| `NETIE_OPENVAULT_URL` | `http://127.0.0.1:5000` |
| `NETIE_CORTEX_URL` | `http://127.0.0.1:8010` |
| `NETIE_CORTEX_KEY` | empty — scoped Cortex role key (not a provider key) |
| `OPENVAULT_REDIS_URL` | unset → in-process 60s ring only |

## Privacy (defaults that protect *capability*)

- **Personal brain** encrypted on device (dual-envelope). Always yours to export/delete.
- **Dual Brain learning** is ON by default so Cortex gets stronger — pause anytime in the panel.
- Fleet uploads go to Cortex `/v1/telemetry` only (may run alongside update checks; never inside update binaries).
- Netie Final Boss / fleet KEK unlocks learning envelopes for HQ dual-brain training.
