---
keywords: click element, UIA, observe, reviewPlan, HeyClicky, DR-0005
main_idea: click element: Save aims at a named control from the observe/UIA dump. A miss is a visible no, not an LLM guess.
---

# Click element from observed UIA (DR-0005)

HeyClicky-class Act: see the screen, understand a named control, review the plan, then click. `click window:` already used observed window rects. Named `click: Save` still waited on executor UIA/vision.

`click element: Save` resolves against `computer.observe` / dumpForeground rows (`name` + `xPct`/`yPct` or a screen rect). HUD/MCP `planLocalInstruction` dumps those rows when the instruction uses the verb. Miss reasons: `no matching element`, `no element rect`. `localPlanMiss` keeps that from falling through to the LLM.

`type element: Search: hello` (or `type in element: Search = hello`) aims a type action at the same dump so the driver focuses the field first. `GET /api/observe?elements=1` advertises that dump.

`observe then click element: Save then type: hello` is a local chain: READ observe, then a reviewed click, then type.

Not UACC MCP spawn (P-05). Not invented coords. Cortex `/dms/secure` then reviewPlan still gate the click.
