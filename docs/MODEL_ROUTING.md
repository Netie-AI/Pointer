# Model routing — Gemini first, cloud backup

Pointer never holds provider API keys. OpenVault (`:5000`) hydrates keys;
Cortex (`:8010`) gates Act via `/dms/secure`.

## Order (Beat Realtime pack)

| Priority | Provider | Env (OpenVault / Cortex) | Role |
|----------|----------|--------------------------|------|
| 1 | **Gemini AI Studio** | `GEMINI_API_KEY` | Default Ask / plan / vision |
| 2 | Anthropic | `ANTHROPIC_API_KEY` | Backup reasoning |
| 3 | OpenAI | `OPENAI_API_KEY` | Backup; Realtime voice only behind flag |
| 4 | Groq / OpenRouter | optional | Fast/cheap overflow |

Pointer defaults:

```text
NETIE_CLICK_MODEL=gemini-2.0-flash
NETIE_PROVIDER_ORDER=gemini,anthropic,openai,groq
```

Cortex engine state should prefer the same:

```json
{ "primary_provider": "gemini", "provider_order": ["gemini", "anthropic", "openai", "groq"] }
```

Set via `POST /api/engine/config` or bake into demo config — **do not** put keys in Pointer.

## Fail-closed Act

Provider order does **not** bypass Cortex. Recipes, skills, and LLM plans all call
`/dms/secure` with `failClosed:true` before any driver work (A-0007).

## Voice vs GPT-Realtime 2.0

Default: local VAD + arm hotkey. Cloud duplex (Gemini Live / OpenAI Realtime) is
**backup only** behind `NETIE_VOICE_CLOUD=1` (scaffold; not product default).

## Human setup

1. Put `GEMINI_API_KEY` in OpenVault (and Cortex `env.local` if workflows hydrate there).
2. Restart OpenVault.
3. Confirm HUD insight `Planned via … · gemini-…` on an Ask/Act.
