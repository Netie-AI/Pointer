---
status: accepted
date: 2026-08-27
decision-makers: founder
---

# DR-0005 - UACC skills, screenshotable HUD, loopback observe API

## Context and Problem Statement

Founder request (2026-08-27): make Pointer the Windows peer of OpenWillow,
HeyClicky, and Cluely; first give it UACC skills; disable the
non-screenshotable window so Pointer is detectable to agents; restyle the
HUD away from liquid-glass slop; then expose loopback MCP/API so other
agents can use this computer.

This is a PRD amendment from the founder, not an unrouted agent invention.
It does not reopen closed tickets. It does not bundle OpenWillow wholesale
(P-04, GPLv3 + Deepgram default still need their own DR). It does not load
arbitrary third-party MCP servers.

## Decision Outcome

1. **Screenshotable by default.** `captureVisible` defaults on. Existing
   installs migrate once (settings v3). The toggle remains so a user can
   hide the HUD from shares. `NETIE_CAPTURE_VISIBLE=1` still wins. Agents
   must be able to see Pointer before they can scale against it.
2. **UACC skills, not an ungoverned UACC process.** `pip install uacc` on
   Windows (`scripts/install_uacc.ps1`). Pointer ships a first-party skill
   catalog matching UACC's READ tools (screen info, find element, windows).
   Consequential UACC verbs are search hits only; they still go through
   plan-guard and Cortex `/dms/secure`. `NETIE_UACC=0` disables the probe.
3. **Loopback detectability API.** First-party MCP tools `computer.status`
   and `computer.observe` plus `GET /api/computer` on `127.0.0.1:18010`.
   `computer.act` (also `POST /api/computer`) runs Cortex `/dms/secure`
   then reviewPlan. Consequential verbs still need `approved:true`. Public
   `host.netie.ai` `/mcp` stays 404. Third-party MCP marketplace stays P-05.
4. **HUD identity.** Kill `backdrop-filter` liquid glass on core HUD
   (already required by `docs/PRODUCT_SURFACE.md`). IBM Plex Serif + Sans,
   solid panels, fixed top chrome. Clicky ring / stage orb stay banned
   (DR-0002).
5. **OpenWillow.** Port patterns only (hold-to-talk, dictation, scribe
   rewrite, BYOK STT URL, remembered target window). No GPLv3 dump (P-04).
   Scribe is a first-class listening mode that pastes after a Cortex gate.

## Confirmation

`test/uacc.test.js`, `test/mcp-abi.test.js`, `test/computer-act.test.js`,
`test/acceptance/live-ux.test.js`, `test/acceptance/privacy-hud.test.js`,
`test/coordinator.test.js`.
