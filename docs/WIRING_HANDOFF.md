# Netie Clicks — wiring status

Branch `netie-ecosystem-contracts`.

## Zen scorecard

| Surface | Status | Notes |
|---|---|---|
| Cortex gate + OpenVault vision | ✅ | fail-closed on act |
| One-tap **Go** | ✅ | intent ask/act |
| Plan review + Run | ✅ | irreversible unchecked |
| **Real input driver** | ✅ | Win32 SendInput via PowerShell; `NETIE_CLICK_DRY_RUN=1` for safe tests |
| Dual-envelope vault | ✅ | DPAPI; test-plain blocked unless env |
| Fleet Dual Brain (default ON) | ✅ | `/v1/telemetry` only; skip if user-kek verify fails |
| Consent truthiness | ✅ | `coerceBool` — `"false"` is false |
| Personal brain | ✅ | silent remember + habits |
| Tests | ✅ | `npm test` (ecosystem+vault+intent+zen) |

## Still open (not blocking local zen)

1. Cortex `/v1/telemetry` + `/register` live endpoints (Cortex lane).
2. OpenVault custody inject for secret fields.
3. Live multi-monitor coordinate mapping polish.
4. Optional: swap PowerShell driver for nut-js later if latency matters.

## Ops

```powershell
npm test
$env:NETIE_CLICK_DRY_RUN=1; npm start   # no real clicks
npm start                               # real clicks after Approve
```
