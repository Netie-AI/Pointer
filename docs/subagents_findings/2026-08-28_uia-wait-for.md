---
keywords: UIA, wait for, wait_for_element, UACC, computer.act, timeout
main_idea: wait for: Save polls the foreground UIA tree until the named control exists; timeout is a visible no; first-party UACC wait_for_element
---

# UIA wait for a named control

UACC lists `wait_for_element` as a READ skill. Pointer searched it and
did not run it. Agents that `open: notepad then type: hello` typed into
whatever still held focus.

Shipped: `waitForControl` in `electron/netie/uia.js` polls the foreground
tree with the same probe as targeting. `wait for: Save` plans `uia_wait`
(default 5000ms, cap 15000). Hit returns the control name. Timeout is a
visible no. Read-only. Cortex `/dms/secure` still required. `wait 400`
is still a sleep.

Not done: real Windows laptop proof after a launch; no third-party UACC
MCP spawn (P-05).
