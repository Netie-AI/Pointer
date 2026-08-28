---
keywords: report a problem, HUD, bug-report, clipboard, #29, no cloud relay
main_idea: Fixed top chrome Report a problem copies a local note and writes a file on this device. No cloud relay. Ticket #29 stays open.
---

# HUD Report a problem (#29)

AirGPT already had a founder-facing report path. Pointer HUD had none, so a
Word sink writing `recovered selection` had no in-app way to mark it.

Fixed top chrome now has Report a problem. The panel stays on the HUD (not a
settings page). Copy report puts a local note on the clipboard and writes
`report-<id>.md` under NetieClicks/reports. No `syncFleet`, no telemetry
flush, no cloud relay. Ticket #29 stays open.
