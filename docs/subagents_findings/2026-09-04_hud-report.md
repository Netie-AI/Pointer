---
keywords: report a problem, HUD, bugReportBtn, startBugReport, #29, no cloud relay
main_idea: Fixed top chrome Report a problem opens a local diagnostics form. Copy is human-confirm only. No fetch, mailto, or cloud relay. Ticket #29 stays open.
---

# HUD Report a problem (#29)

AirGPT already had `#bugReportBtn` / `startBugReport`. Pointer HUD on main had
none, so a Word sink writing `recovered selection` had no in-app way to mark it.

Fixed top chrome now has Report a problem. The panel stays on the HUD (not a
settings page). Copy diagnostics is human-confirm only and uses the existing
`hud:copyText` path. No `syncFleet`, no telemetry flush, no cloud relay.
Region-mark + outbound mail stays P-07. Ticket #29 stays open.
