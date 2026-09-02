---
keywords: UIA, ValuePattern, fill: Search, type in:, set:, HeyClicky, smart_type, no SetCursorPos, computer.act
main_idea: Named fill: Search: hello tries Windows ValuePattern before SendInput so the cursor stays put; Chrome miss falls back to click then type; set: is ValuePattern only
---

# UIA ValuePattern for named fields

HeyClicky / UACC smart_type fill a named box. Pointer already dumped the
foreground UIA tree for targeting, then still clicked the field and typed
with SendInput.

Shipped: `setValueControl` in `electron/netie/uia.js` walks the foreground
tree, picks an Edit/ComboBox/Document (not Button), then ValuePattern.SetValue
on the exact name+type. No SetCursorPos. No SendInput. Password boxes
refuse. `fill: Search: hello` and `type in: Search: hello` try this first
in `executeApproved` (Windows, live, UIA enabled); miss falls back to
click-the-field then type. `set: Search: hello` plans `uia_set` (SetValue
only, visible no on miss). Cortex `/dms/secure` still required.

Not done: real Windows laptop proof that a named Edit sets; Chrome
custom-drawn fields still need the SendInput fallback.
