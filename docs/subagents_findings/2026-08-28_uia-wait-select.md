# UIA wait-for and SelectionItemPattern select

Keywords: UIA, wait for, wait_for_element, SelectionItemPattern, select, TabItem, TreeItem, keepCursor, DR-0006, Clicky

Main idea: Named `wait for: Save` polls the foreground automation tree until that control exists (default 5000ms, cap 15000). Timeout is a visible no so the next click does not aim at a screen that is not ready. Named `select: Home` uses SelectionItemPattern on TabItem / ListItem / RadioButton / DataItem / TreeItem without moving the cursor. Button / Edit / CheckBox stay not selectable. The select probe uses SELECT_CONTROL_TYPES so TreeItem is visible (same pattern as expand). Cortex `/dms/secure` then reviewPlan still gates Act. `wait 400` stays a duration wait.

Wire: `waitForControl` / `selectControl` in `electron/netie/uia.js`; driver `uiaWait` / `uiaSelect`; planner `wait for:` -> `uia_wait` (READ) and `select:` -> `uia_select` (CONSEQUENTIAL). Linux tests inject `run`; never spawn PowerShell.
