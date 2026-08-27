---
keywords: UACC, captureVisible, computer.observe, screenshot, clipboard, PATH overlay, computer.act, Scribe, delivery, IBM Plex, DR-0005
main_idea: Founder DR-0005 makes Pointer screenshotable, ships UACC READ skills, loopback computer.status/observe/act (PNG + clipboard on observe), remembered-window dictation, Scribe, and PATH teach strokes. OpenWillow wholesale remains P-04.
---

# UACC detectable HUD (DR-0005)

Pointer HUD was content-protected by default, so UACC and other agents could not see it. Liquid-glass CSS also violated PRODUCT_SURFACE (no backdrop-filter on Windows Electron).

Shipped: settings v3 captureVisible=true; uacc.js skill catalog; GET/POST /api/computer /api/scribe /api/meeting; MCP computer.status/observe/act/scribe/meeting_assist; IBM Plex solid HUD; focus_hwnd delivery; Scribe mode; Ctrl+Alt+Space/M/L. computer.act/scribe/meeting refuse without Cortex /dms/secure. Instruction text maps to recipes then type/click/deliver.

Observe PNG/clipboard: live `computer.observe` captures `captureDisplayCrop` when `screenshot:true` and `driver.clipboardGet` when `clipboard:true`. Loopback `GET /api/observe?screenshot=1&clipboard=1` forwards those flags. Clipboard is tagged untrusted data. PATH tokens draw click-through polylines. Overlay now fires for LINE/PATH-only answers, not just POINT.

Meeting: Recap and Follow-ups pills in fixed top chrome. `computer.meeting_assist` `kind` say/recap/followups. `GET /api/meeting?notes=1` returns live notes as untrusted data (no Cortex hop).

Scribe pending: failed rewrite keeps transcript+hwnd. Retry re-runs; Paste as-is delivers raw dictation. `GET /api/scribe?pending=1`.

Not done: UACC install on a real Windows laptop; OpenWillow Deepgram default (P-04); third-party MCP (P-05); Cluely undetectable-in-screenshare stays inverted (DR-0005).
