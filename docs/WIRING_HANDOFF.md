# Netie Clicks — wiring status

Branch `netie-ecosystem-contracts` — **complete for this slice.**

| Surface | Status |
|---|---|
| Cortex gate + OpenVault vision | ✅ |
| One-tap **Go** (intent ask/act) | ✅ `clicks:go` + `intent.js` |
| Plan review + Run safe steps | ✅ |
| `executeApproved` | ✅ safety-gated; click/type **driver stub** (nut-js next) |
| Dual-envelope vault + personal brain | ✅ |
| Fleet Dual Brain learning (default ON) | ✅ `/v1/telemetry` + update-check hook |
| Netie fleet KEK auto-seed | ✅ `vault.ensureFleetKek()` |
| Idiot-proof panel | ✅ Go / Dual Brain badge / silent memory |
| Tests | `npm test` → 32 passed |

## Still open (next slices)

1. Real input driver behind `executeApproved` (`nut-js`).
2. Cortex `/v1/telemetry` + `/v1/telemetry/register` (HQ Final Boss KEK issue) — Cortex lane.
3. OpenVault custody inject for secret fields.
4. Live smoke with Cortex + OpenVault up.
