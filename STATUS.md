# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

1. **Open PR #1** (`netie-ecosystem-contracts`): Netie OS adoption — `CLAUDE.md`,
   governed files (`STATUS`, `PARKING_LOT`, `CHANGELOG`, `docs/ACTIVE.md`), decision
   record `docs/decisions/0001-…`. Not merged.
2. **Agentic HUD shipped on branch** — persistent SendInput worker, on-device STT chain,
   vault-fill custody, planner whitelist; 331 pack assertions + 11 Electron smoke checks
   reported green in recent commits. No CI runs them on push.
3. **Cross-repo deps undocumented** — Act path expects Cortex `:8010`, credentials from
   OpenVault `:5000`; neither declared in `docs/ACTIVE.md` (gap called out in PR #1).

## Next

- Merge PR #1 or fill `CLAUDE.md` Hard rules (Act fail-closed called out as first candidate).
- Add CI (same class of gap as missing agent contract).
- `FULL_PLAN.md` / `docs/ACTIVE_PLAN.md` still referenced by prompts and acceptance tests.

## Later

- OpenVault custody endpoint for `clicks.custody.requested` (TBD per `docs/CONTRACTS.md`).
