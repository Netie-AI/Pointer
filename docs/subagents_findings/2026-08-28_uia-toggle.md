---
keywords: UIA, TogglePattern, checkbox, computer.act, HeyClicky
main_idea: toggle: Remember me TogglePattern-flips a named CheckBox/RadioButton with no cursor warp; check:/uncheck: set On/Off; radio uncheck refuses
---

# UIA TogglePattern for named checkboxes

HeyClicky clicks named checkboxes by moving the cursor. Pointer already
aims `click: Remember me` via UIA rect then SendInput. That still warps
the pointer.

Shipped: `toggleControl` in `electron/netie/uia.js` finds a foreground
CheckBox or RadioButton and calls TogglePattern. `toggle: Remember me`
flips. `check:` / `uncheck:` Toggle until On/Off (one extra Toggle for
Indeterminate). Radio uncheck is a visible no. Button/Edit are not
toggleable. No SetCursorPos. Cortex `/dms/secure` still required.

Not done: real Windows laptop proof on a settings dialog; no third-party
UACC MCP spawn (P-05).
