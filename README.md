# Netie Clicks

Standalone Windows screen buddy at `D:\Netie Clicks`.

MIT Clicky reference: `D:\OpenVault\vendor\clicky` ([farzaa/clicky](https://github.com/farzaa/clicky)).
LLM + keys: OpenVault `http://127.0.0.1:5000` (no Cloudflare worker).

## Run

```powershell
# 1) OpenVault API
cd D:\OpenVault\OpenMW
uv run openmw console --host 127.0.0.1 --port 5000 --no-open-browser

# 2) Netie Clicks
cd "D:\Netie Clicks"
npm start
```

## Use

1. **Ctrl+Space** — arm session (starts 60s hot-memory ticks)
2. **Drag** a rectangle on the dimmed overlay — region screenshot
3. Type an instruction (“click Save”, “what is this dialog?”) → **Ask buddy**

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
| `NETIE_CLICK_HOTKEY` | `Control+Space` |
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
