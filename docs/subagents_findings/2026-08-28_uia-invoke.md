---
keywords: UIA, InvokePattern, invoke, click, keepCursor, SendInput fallback, Button, DR-0006, Clicky
main_idea: Named click: Save tries InvokePattern before SendInput so the cursor stays put. Chrome miss falls back to aim. invoke: Save is Invoke only. Edit/Document stay not invokable. Cortex gate unchanged.
---

# UIA InvokePattern for named clicks

Port of blocked #51 InvokePattern onto mergeable #57 (post-#46 main).
Clicky-class named click, DR-0006 slice.

- `click: Save` tries Invoke on win32 before screenshot/SendInput
- Miss (Chrome, Edit, no pattern) falls through to existing aim path
- `invoke: Save` is Invoke only (`uia_invoke`)
- Double-click / right-click / hover stay SendInput
- Probe injects `run`; Linux never spawns PowerShell
- Driver keepCursor/keepFocus. Plan-guard DRIVER_ACTIONS. Safety CONSEQUENTIAL
