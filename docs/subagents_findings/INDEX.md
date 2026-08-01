# Subagents findings — Pointer

| Date | Topic | Keywords | Main idea | Path |
|------|-------|----------|-----------|------|
| 2026-07-31 | adversarial-residuals | A-0005, A-0007, recipe, secure | Confirmed 20; recipe must fail-closed on /dms/secure | `../findings/ADVERSARIAL_2026-07-31.md` |
| 2026-07-31 | claude-code-memory | MEMORY.md, identity, no-secrets | Index + topic files; never store PII/secrets in Claude memory | `2026-07-31_claude-code-memory.md` |
| 2026-07-31 | optio-persistent-agents | sticky, inbox, MEMORY.md | Service-model turns; Pointer BG agents map to sticky encrypted store | `2026-07-31_optio-persistent-agents.md` |
| 2026-07-31 | oracle-agent-memory | PII filter, scope, DB | App owns auth; filter before persist; extract prefs not credentials | `2026-07-31_oracle-agent-memory.md` |
| 2026-07-31 | mem0-qdrant-patterns | retrieval, TTL, redaction | Design inputs only — Pointer stays DPAPI MemoryStore | `2026-07-31_mem0-qdrant-patterns.md` |
| 2026-07-31 | cortex-skills-connectors | SkillCards, MCP, F8 | Add Pointer SkillCards first; expand F8; no arbitrary MCP load | `2026-07-31_cortex-skills-connectors.md` |
| 2026-07-31 | cortex-dag-jepa | gen-cFSM, collapse, OSR | Wire collapse into engine/run; no trained JEPA this pack | `2026-07-31_cortex-dag-jepa.md` |
| 2026-07-31 | cortex-voice-vs-realtime | VAD, Gemini Live backup | Beat Realtime via governance + local VAD; cloud duplex flag only | `2026-07-31_cortex-voice-vs-realtime.md` |
| 2026-07-31 | cortex-physics-worldmodel | JEPA proxy, physics metaphor | Cosine collapse proxy only; no physics engine | `2026-07-31_cortex-physics-worldmodel.md` |

Template: use Cortex `_TEMPLATE.md` shape (keywords + main_idea on top).
