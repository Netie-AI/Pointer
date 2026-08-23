---
keywords: recall, retentionMs, purgeExpired, DR-0003, sealed
main_idea: Eviction used to persist every aged-out frame under dataDir/recall; drop time-expired frames and sweep recall-*.enc.json to the 60s ring
---

# Recall retention bound

PR #26 implemented the same mechanic on pre-#27 `af25bb0` and is merge-dirty.
This lane re-implemented on a new unused branch off contracts after #27.
Do not attach work to `cursor/recall-sealed-expiry-a498`.
