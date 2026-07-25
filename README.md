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

- `FULL_PLAN.md` — product + Redis schema + week cut
- `ARCHITECTURE.md` — Clicky → Electron map
- `NOTICE` — MIT attribution

## Env

| Var | Default |
|---|---|
| `NETIE_CLICK_HOTKEY` | `Control+Space` |
| `NETIE_CLICK_MODEL` | `gpt-4o-mini` |
| `OPENVAULT_REDIS_URL` | unset → in-process 60s ring only |
