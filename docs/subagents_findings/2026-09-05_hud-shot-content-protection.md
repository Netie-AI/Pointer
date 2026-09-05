---
keywords: setContentProtection, DWM affinity, CDP capture, hud-shot, DR-0006, z-index, R-0004
main_idea: Content protection is a DWM window flag that never reaches the compositor, so Playwright CDP capture photographs the HUD with protection still ON - no setting flip, no launcher flag
---

# Screenshotting a content-protected HUD, and what the first look found

## The mechanism

`main.js applyContentProtection` calls `setContentProtection(true)` on four
windows. On Windows that is `SetWindowDisplayAffinity`, a DWM flag on the OS
window: PrintScreen, desktopCapturer, and every screen-share pipeline come back
with the HUD missing. main.js already said the rest in a comment nobody had
run - "CapturePage still works for us" - because the flag never reaches the
compositor, and a CDP `Page.captureScreenshot` renders from there.

So the debug affordance needed no setting and no new default:

    node scripts/hud-shot.js --themes=dark,computer

boots Electron under Playwright, drives each scene through the HUD's own
controls, and writes PNGs plus a `manifest.json` recording whether protection
was on during the capture. `contentProtection: true` in that manifest is the
claim, made checkable.

**The wrong fix, which was proposed and rejected:** wiring
`NETIE_CAPTURE_VISIBLE=1` into `scripts/netie-launch.ps1`. That is not a debug
affordance, it is a shipped behaviour change - every Teams share from that
session would carry the HUD. `test/invariants/hud-shot.test.js` refuses it, and
refuses the harness setting the env or writing `captureVisible` for itself.

## Gotchas that cost real time

- **`page.addStyleTag` is refused by the HUD's own CSP.** hud.html ships
  `style-src 'self'`, and addStyleTag appends a literal `<style>`. Use a
  constructed stylesheet (`new CSSStyleSheet()` + `adoptedStyleSheets`) - CSSOM
  is not parsed markup, so it lands without a nonce and without touching the
  policy the product ships.
- **Piping the harness through `tail` hides every stage line** until exit, which
  makes a slow boot indistinguishable from a hang. Stage logs go to stderr.
- **Screenshot timeouts are a memory symptom, not a logic bug.** main.js calls
  `app.disableHardwareAcceleration()` on Windows, so a 1920x1140 transparent
  window composites in software. Under ~1.2 GB free RAM, 7 of 16 captures timed
  out at 60s; the same scenes passed on the next attempt. Fixed with
  `animations: "disabled"` plus one retry.
- **Electron shutdown hangs.** Pointer preventDefaults `window-all-closed` by
  design, so `app.close()` waits for a quit that never comes. Same watchdog plus
  `taskkill /T /F` as `test/smoke/hud-boot.smoke.js`.

## What the first rendered look found

Nothing below was visible in source review. All of it was visible in one PNG.

- **Two overlays shared `z-index: 40`** - the settings menu and the first-run
  onboard card - so the winner was DOM order. The card is later in hud.html, so
  on a fresh profile it painted over the bottom half of Settings and swallowed
  five controls including "Visible to screen capture", the very toggle for
  capture. Fixed at the class (R-0004): a named `--z-*` scale on `.hud`, with a
  gate that fails on any bare numeric z-index, any duplicate layer, and on
  `--z-menu <= --z-onboard`.
- **The top pill clips its own controls.** `max-width: min(980px, 94vw)` is
  exceeded: "Ask AI" and "Report a problem" each wrap to two lines and the
  Ctrl+backtick kbd on Show/Hide is cut off at the right edge. Reported, not
  fixed - founder deferred it this session.

## Two gate failures worth keeping

**A gate can pass on half a cause.** The top bar's wrapped labels needed BOTH a
980px cap and pills that were allowed to wrap. Reverting either one alone left
the rendered gate green; only reverting both turned it red. When mutation-
testing a layout fix, revert the whole change, not one line of it - otherwise
"the gate can fail" is unproven and you have measured nothing.

**A rule keyed to an enumeration breaks when the enumeration grows.** Both
system-audio icons ship `display: none` and each theme opted one in by name.
That rule was correct for a year and stopped being correct the moment a fourth
theme existed - the new theme matched no branch and the button painted nothing.
The repair is to make one branch the default and let the others opt out, so an
unlisted member degrades to wrong rather than to absent. The gate then
enumerates from the stylesheet itself, not from a list kept in the test.

Corollary: `display: block` on a broken `<img>` passes a display check while
painting nothing. Assert `naturalWidth` when the claim is "the customer sees an
icon".

## DR-0006 routing

`prd-agent` found the UI ask was not net-new: `DR-0006` (proposed 2026-08-28)
already specifies it and lives only on `origin/cursor/pointer-willow-rust-core-8217`,
never on main. The PRD feedback ledger stops at F28 and has no row for DR-0004,
DR-0005 or DR-0006. Founder ratified DR-0006 on 2026-09-05 with mint/white
Computer **joining** dark/light/gra rather than replacing them.

The "joins" half matters and is now gated: `--glass-blur: none` inside
`.hud.theme-computer` only, while `:root` keeps a real blur, so a later tidy-up
that strips `backdrop-filter` estate-wide turns
`test/invariants/hud-surface.test.js` red instead of silently converting a
ratified decision into the option that was not chosen.

**Open, not repaired here:** `DR-0005` is used twice on origin/main
(`DR-0005-coworker-desks-online-workspace.md`, `DR-0005-uacc-detectable-loopback.md`).
R-0013 forbids ID reuse; one needs renumbering.

cite: session 2026-09-05, Pointer branch feat/unattended-ledger-mandate
