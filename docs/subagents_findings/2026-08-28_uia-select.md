---
keywords: UIA, SelectionItemPattern, tab, list, computer.act, HeyClicky
main_idea: select: Home SelectionItemPattern-picks a named TabItem/ListItem/Radio with no cursor warp; Button/Edit/CheckBox refuse
---

# UIA SelectionItemPattern for named tabs

HeyClicky points then clicks tabs. Pointer already aims `click: Home`
via UIA rect then SendInput. That still warps the pointer.

Shipped: `selectControl` in `electron/netie/uia.js` finds a foreground
TabItem, ListItem, RadioButton, DataItem, or TreeItem and calls
SelectionItemPattern.Select. `select: Home` is Select only. Button,
Edit, and CheckBox are not selectable. No SetCursorPos. Cortex
`/dms/secure` still required.

Not done: real Windows laptop proof on a settings tab strip; no
third-party UACC MCP spawn (P-05). Unsurveillance stays P-07.
