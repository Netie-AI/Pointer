---
keywords: HUD, screenshot, computer.observe, UACC, captureVisible
main_idea: GET /api/observe?hud=1 returns Pointer chrome PNG plus rect so agents can see and test the HUD; content-protected is a visible no; unsurveillance is P-07
---

# Observe HUD chrome for agents

Agents could screenshot the display (`?screenshot=1`) and still not know
whether Pointer chrome was in the shot. `captureVisible` already defaults
on (DR-0005). What was missing was a first-party HUD crop they can fetch.

Shipped: `computer.observe` `hud: true` and `GET /api/observe?hud=1` call
`capturePage` on the HUD window and return a PNG plus screen rect. If
`captureVisible` is off the reason is `content-protected` (not a stealth
self-shot). Hidden HUD is `hud hidden`. Read-only. No Cortex.

Not done: real Windows laptop proof that UACC sees the PNG; Cluely
invisibility stays P-07.
