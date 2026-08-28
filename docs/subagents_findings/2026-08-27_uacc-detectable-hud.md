---
keywords: UACC, captureVisible, computer.observe, screenshot, clipboard, PATH overlay, meeting recap, followups, pending scribe, retry, computer.act, chain, captureNowForAsk, Scribe, delivery, IBM Plex, DR-0005, privacy chip, session chip
main_idea: Screenshotable HUD, loopback act+observe, chained local verbs, Ask live crop, Scribe retry/pending dictation, PATH strokes, Cluely recap/follow-ups plus live notes API, honest on-device vs off-device privacy chip, OpenWillow session chip
---

# UACC detectable HUD (DR-0005)

Pointer HUD was content-protected by default, so UACC and other agents could not see it. Liquid-glass CSS also violated PRODUCT_SURFACE (no backdrop-filter on Windows Electron).

Shipped: settings v3 captureVisible=true; uacc.js skill catalog; GET/POST /api/computer /api/scribe /api/meeting; MCP computer.status/observe/act/scribe/meeting_assist; IBM Plex solid HUD; focus_hwnd delivery; Scribe mode; Ctrl+Alt+Space/M/L. computer.act/scribe/meeting refuse without Cortex /dms/secure. Instruction text maps to recipes then type/click/deliver.

Observe PNG/clipboard: live `computer.observe` captures `captureDisplayCrop` when `screenshot:true` and `driver.clipboardGet` when `clipboard:true`. Loopback `GET /api/observe?screenshot=1&clipboard=1` forwards those flags. Clipboard is tagged untrusted data. Windows and foreground include x y width height plus center cx cy (GetWindowRect, DIP in main). PATH tokens draw click-through polylines. Overlay now fires for LINE/PATH-only answers, not just POINT.

Meeting: Recap, Follow-ups, and Email pills in fixed top chrome. `computer.meeting_assist` `kind` say/recap/followups/email. `GET /api/meeting?notes=1` returns live notes as untrusted data (no Cortex hop). Copy recap and `GET /api/meeting?recap=1` share the last Recap from main. Copy say and `GET /api/meeting?say=1` share the last Suggest/Say from main. Copy email and `GET /api/meeting?email=1` share the last follow-up email from main. Meeting LIVE captions are fixed chrome (system audio only, no cursor-follow).

Privacy chip: `#privacy-chip` in fixed top chrome names On device / STT leaves / LLM leaves / STT+LLM leave. Empty STT/LLM URLs resolve to loopback before labeling. `computer.status.privacy` matches. Not an orb.

Session chip: `#session-chip` names Ready / Recording / Transcribing / Scribing / Paused / Error. `computer.status.session` matches so agents can wait. Scribe in-flight wins over STT. Error wins until the next success.

Scribe pending: failed rewrite keeps transcript+hwnd. Retry re-runs; Paste as-is delivers raw dictation. `GET /api/scribe?pending=1`.

Act chain: `focus: notepad then type: hello` concatenates local plans (`source: chain`). `click window: notepad` clicks the observed window center. Absolute x/y skips vision re-aim. HUD Ask and clicks:go use the same planner (raw Ask text, not attachments). Window miss is a visible no, not an LLM guess. `type: hello then world` stays one type. Ask uses `captureNowForAsk` (fresh `captureDisplayCrop`) for meeting + general; retry/dictate skip it.

Not done: UACC install on a real Windows laptop; OpenWillow Deepgram default (P-04); third-party MCP (P-05); Cluely undetectable-in-screenshare stays inverted (DR-0005).
