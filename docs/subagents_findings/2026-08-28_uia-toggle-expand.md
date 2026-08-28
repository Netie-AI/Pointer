---
keywords: UIA, TogglePattern, ExpandCollapsePattern, toggle, check, uncheck, expand, collapse, keepCursor, TreeItem, CheckBox, DR-0006, Clicky
main_idea: Named toggle/check/uncheck and expand/collapse drive foreground UIA patterns without SetCursorPos or SendInput. Leaf nodes and non-toggleable Buttons are a visible no. Cortex gate unchanged.
---

# UIA TogglePattern + ExpandCollapsePattern

Port of blocked #54 TogglePattern onto mergeable #57 (post-#46 main) plus
ExpandCollapse for trees/combos. Clicky-class named verbs, DR-0006 slice.

- `toggle: Remember me` / `check:` / `uncheck:` -> `uia_toggle`
- `expand: Documents` / `collapse:` -> `uia_expand`
- Probe injects `run`; Linux never spawns PowerShell
- Expand probe types include TreeItem/Group (not in TARGET_CONTROL_TYPES)
- Radio uncheck refuses. LeafNode refuses. Already On/Off/Expanded/Collapsed
  is ok with `changed:false`
- Driver keepCursor/keepFocus. Plan-guard DRIVER_ACTIONS. Safety CONSEQUENTIAL
