---
keywords: UACC, captureVisible, computer.observe, IBM Plex, DR-0005
main_idea: Founder DR-0005 makes Pointer screenshotable by default, ships UACC READ skills, and exposes loopback computer.status/observe so other agents can detect this desktop. computer.act stays fail-closed. OpenWillow wholesale remains P-04.
---

# UACC detectable HUD (DR-0005)

Pointer HUD was content-protected by default, so UACC and other agents could not see it. Liquid-glass CSS also violated PRODUCT_SURFACE (no backdrop-filter on Windows Electron).

Shipped: settings v3 captureVisible=true; uacc.js skill catalog; GET /api/computer; MCP computer.status/observe; IBM Plex solid HUD. computer.act refuses without Cortex /dms/secure.
