---
keywords: [oracle, agent-memory, PII, scope]
main_idea: Oracle Agent Memory is DB-backed; app owns auth/scope; filter credentials before persist; custom extraction must exclude secrets.
---

# R3 — Oracle AI Agent Memory

- Short-term messages + durable memories + hybrid retrieval in Oracle AI Database.
- `user_id` is a scope id, not proof of identity — caller authenticates.
- **Map to Pointer:** same discipline — extract seat_pref / meal_pref; never extract passport_number / card / OTP into durable notes.
