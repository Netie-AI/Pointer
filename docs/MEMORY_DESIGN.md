# Pointer personal memory design

**Decision:** extend existing DPAPI vault + `electron/netie/memory/store.js` (HMAC search index). No mem0/Qdrant/Redis runtime.

## Layers

| Layer | Store | Contents |
|-------|-------|----------|
| Profile | `settings.profile` via `vaultProfile()` | Non-secret form fields (`email`, `passport_name`, …) |
| Secrets | OpenVault custody only | password, OTP, passport_number, card |
| Notes | sealed `MemoryStore` records | "what worked", prefs — no raw screenshots |
| Imports | `import/{claude,cursor,chatgpt}.js` | Conversations; strip SECRET_KEYS before profile merge |

## Rules from R1–R4

1. Plans/LLM/audit see `{{vault.profile.*}}` only.
2. Enquire UI fills missing profile keys; never type placeholders.
3. Memory search hints to planner are **masked** ("prefers aisle"), not raw PII.
4. Claude Code MEMORY.md is for coding habits — not the user's passport.

## Identity

Windows CurrentUser DPAPI + `deviceId`. Lost device ⇒ personal vault unreadable (by design).
