---
keywords: [gen-cFSM, JEPA, collapse, DAG, OSR]
main_idea: gen-cFSM collapse bands (TERMINATE/CONTINUE/TOOL/REGENERATE) exist; wire into /api/engine/run for open-band voice tasks — no trained JEPA weights this pack.
---

# R6 — Governed DAGs + JEPA-style collapse

- Code: `CortexOS/execution/gen_cfsm.py`, `osr.py`, `dag_runner.py`.
- Research: `docs/research/findings/G1_GEN_CFSM_JEPA.md` (cosine proxy).
- **Next WP C-CFSM-01:** route open OSR band → gen-cFSM → dag_runner from engine/run.
