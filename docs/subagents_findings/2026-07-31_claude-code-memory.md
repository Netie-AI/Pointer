---
keywords: [claude-code, MEMORY.md, identity, PII]
main_idea: Claude Code loads MEMORY.md index (200 lines/25KB) + on-demand topic files; never put secrets or raw PII in auto-memory — Pointer vault is the PII store.
---

# R1 — Claude Code persistent memory

- Layers: managed CLAUDE.md → user `~/.claude/CLAUDE.md` → project CLAUDE.md → local CLAUDE.local.md → auto-memory under `~/.claude/projects/<id>/memory/`.
- `MEMORY.md` is an index; bodies live in topic files loaded on demand.
- Identity plugins may store a name under `~/.claude/persistent-identity/` — not a substitute for DPAPI vault profile.
- **Map to Pointer:** personal facts → encrypted `MemoryStore` + `settings.profile`; Claude/Cortex prompts get placeholders / masked prefs only.
