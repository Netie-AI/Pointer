---
keywords: HeyClicky, keepCursor, keepFocus, restore cursor, restore foreground, SetCursorPos, SetForegroundWindow, SendInput, warp, click, DR-0005
main_idea: Aimed clicks restore GetCursorPos and the previous foreground hwnd after SendInput so Act does not steal the real pointer or the typing window. Type/fill still steal focus. hover still travels. warp:true keeps the old animation.
---

# Clicks restore the real cursor and previous window (DR-0005)

HeyClicky-class recipes click other windows while the user keeps their mouse
and keeps typing. Pointer used to ease the OS pointer to the target (220ms
travel), leave it there, and leave the clicked window in front.

`InputDriver` now aims with SendInput, then restores `GetCursorPos` and
`SetForegroundWindow` to the hwnd from before the click.
`perform(click|doubleclick|rightclick)` skips `moveToAnimated` unless
`action.warp === true` or `keepCursor === false`. Type / fill /
paste-with-coords still pass `restoreFg:false` so text lands.
`hover` / `movecursor` still travel. `computer.status.act.keepCursor` and
`keepFocus` are true. No PostMessage ghost click (Chrome ignores it).
No GPLv3 dump. No third-party MCP.
