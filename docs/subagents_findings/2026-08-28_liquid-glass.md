# liquid glass HUD / overlay / host

keywords: liquid glass, Apple Regular, lensing, backdrop-filter, glass.css, cue bar, walk-chrome, host catalog, reduced-transparency, no floating orb
main_idea: Pointer chrome uses Apple Regular liquid glass (lensing + capsules) on HUD, overlay walk, and host catalog. Live overlay stays transparent. Windows frost fallback stays. Never a Clicky orb.

## Research

WWDC 2025 Liquid Glass: Regular variant works over any content; Clear needs dimming and is wrong on a live desktop overlay. Lensing (edge shine) not grey slabs. Morphing capsules. Reduced transparency -> frostier. Reduced motion -> quieter.

## What we built

- `host/glass.css` shared tokens
- HUD copies tokens (CSP cannot load ../host)
- Overlay links glass.css; live body transparent
- Host `@import` glass.css; desktop wash; desks/This computer as glass cards

## Traps

- Do not blur the user's real display through live overlay
- `@supports not` must keep HUD readable
- `scroll-margin-top: 200px` and `56vh` are test strings
- No clicky-orb / peek-drop in hud.html
