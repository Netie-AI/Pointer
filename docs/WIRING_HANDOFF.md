# Netie Clicks — wiring status

Branch `netie-ecosystem-contracts`.

## Zen scorecard

| Surface | Status | Notes |
|---|---|---|
| Cortex gate + OpenVault vision | ✅ | fail-closed on act |
| One-tap **Go** | ✅ | intent ask/act |
| Plan review + Run | ✅ | irreversible unchecked |
| **Real input driver** | ✅ | Win32 SendInput; dry-run env |
| Vision targeting | ✅ | `targeting.js` fills xPct/yPct when missing |
| Kill switch | ✅ | Esc + Ctrl+Space abort mid-plan |
| Memory-aware plans | ✅ | hot + personal brain into `_llmPlan` |
| Post-step verify | ✅ | region fingerprint; stop on no change |
| Custody client | ✅ | `requestCustody` → `/v1/custody/inject` (soft-fail until OV ships) |
| Tests | ✅ | 42 passed (`npm test`) |

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
