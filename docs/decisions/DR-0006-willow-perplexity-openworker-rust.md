---
status: proposed
date: 2026-08-28
decision-makers: founder
---

# DR-0006 - Willow + Perplexity Computer + OpenWorker home + Rust core

## Context and Problem Statement

Founder amendment (2026-08-28), not an unrouted agent invention. Pointer must
become the Windows peer of Willow (OpenWillow), Perplexity Computer, HeyClicky,
Cluely, and OpenWorker: the HUD must match founder screenshots in
`docs/ui-refs/perplexity-computer`, stay fully controllable like a real agent,
persist in the user home with laptop capability (files, folders, apps,
screenshots, clipboard), then rewrite the laggy hot path in Rust so the core
stays persistent, fast, strong, and fluid.

This expands DR-0005. It does not reopen closed tickets. It does not vendor
OpenWillow / OpenWorker / Perplexity (P-04 and original-code law in
DR-0005-coworker still hold). It does not unlock third-party MCP (P-05) or the
compute box (P-06). Act stays fail-closed (Hard rule 2). Fixed top chrome stays
product identity (DR-0002 / Hard rule 3). No Clicky ring or stage orb.

## Considered Options

- **Big-bang rewrite of Electron into Rust this week.** Would stall the HUD
  and MCP that agents already drive. Rejected as the first slice.
- **Keep spawning PowerShell per action.** Already known lag. Rejected.
- **Persistent Rust core on loopback, Electron HUD kept, PowerShell fallback.**
  Chosen. Click/move/wheel go to a standing `pointer-core` process. Type/UIA
  stay on the current workers until the next rust slices.

## Decision Outcome

1. **Product target.** Pointer is Willow + Perplexity Computer HUD + OpenWorker
   home-resident laptop agent + Cluely/Clicky coworker verbs already in DR-0005.
2. **HUD.** Command bar, status pill, and listening chrome match
   `docs/ui-refs/perplexity-computer` (Ask anything, Attach Files, Folders,
   Active Apps, Screenshots, Clipboard History, Auto, mic, Thinking / File
   ready). Solid fills only: no `backdrop-filter` (Windows Electron corruption,
   PRODUCT_SURFACE). IBM Plex stays. Computer theme is mint/white from the refs.
3. **Home.** `~/.pointer` (or `POINTER_HOME`) is the standing home. Settings
   keep their existing path so old installs do not vanish. Core pid/logs live
   in that home. `computer.status.home` publishes it.
4. **Rust core.** `native/pointer-core` listens on `127.0.0.1:18011`. Electron
   prefers it for click/move/wheel. Missing binary is a visible `engine: none`,
   not a crash. PowerShell worker remains the fallback. Consequential OS still
   needs Cortex `/dms/secure` then reviewPlan.
5. **Rest of the rewrite.** UIA, STT, and HUD chrome stay JS until Windows
   proves this core. Parked as P-08.

## Confirmation

`test/pointer-core.test.js`, `test/driver.test.js`, `test/uacc.test.js`,
`test/acceptance/privacy-hud.test.js`, `cargo test --manifest-path
native/pointer-core/Cargo.toml`.
