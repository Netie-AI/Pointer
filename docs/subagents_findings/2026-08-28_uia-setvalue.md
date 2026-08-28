---
keywords: UIA, ValuePattern, setvalue, fill, type in, set, keepCursor, password, Edit, DR-0006, Clicky
main_idea: Named fill:/type in: try ValuePattern SetValue before SendInput so the cursor stays put. Chrome miss falls back to click then type. set: is ValuePattern only. Password boxes refuse. Cortex gate unchanged.
---

# UIA ValuePattern for named fields

Port of blocked #52 ValuePattern onto mergeable #57 (post-#46 main).
Clicky-class named type, DR-0006 slice.

- `fill: Search: hello` / `type in: Search: hello` -> fill, then executor
  tries SetValue before click+type
- `set: Search: hello` -> `uia_set` (ValuePattern only)
- Password / readonly / Button is a visible no
- Probe injects `run`; Linux never spawns PowerShell
- Driver keepCursor/keepFocus. Plan-guard DRIVER_ACTIONS. Safety CONSEQUENTIAL
  and secret fields stay PROHIBITED
