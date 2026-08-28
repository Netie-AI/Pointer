---
keywords: UIA, InvokePattern, click: Save, invoke: Save, HeyClicky, no SetCursorPos, computer.act
main_idea: Named click: Save tries Windows InvokePattern before SendInput so the cursor stays put; Chrome miss falls back to aim; invoke: Save is Invoke only
---

# UIA InvokePattern for named clicks

HeyClicky-class clicks name a control and Invoke it. Pointer already dumped the
foreground UIA tree for targeting, then still warped the cursor with SendInput.

Shipped: `invokeControl` in `electron/netie/uia.js` walks the foreground tree,
picks a Button/Hyperlink/MenuItem (not Edit/Document), then InvokePattern on
the exact name+type. No SetCursorPos. No SendInput. `click: Save` tries this
first in `executeApproved` (Windows, live, UIA enabled); miss falls back to
UIA-aim or vision then driver SendInput. `invoke: Save` plans `uia_invoke`
(Invoke only, visible no on miss). Cortex `/dms/secure` still required.

Not done: real Windows laptop proof that a named Button Invokes; Chrome
custom-drawn UI still needs the SendInput fallback.
