---
keywords: HeyClicky, keepCursor, restore cursor, SetCursorPos, SendInput, warp, click, DR-0005
main_idea: Aimed clicks restore GetCursorPos after SendInput so Act does not leave the real pointer on the target. hover still travels. warp:true keeps the old animation.
---

# Clicks restore the real cursor (DR-0005)

HeyClicky-class recipes click other windows while the user keeps their mouse.
Pointer used to ease the OS pointer to the target (220ms travel) and leave it
there. That steals the real cursor.

`InputDriver` now aims with SendInput, then restores `GetCursorPos`.
`perform(click|doubleclick|rightclick|fill|paste-with-coords)` skips
`moveToAnimated` unless `action.warp === true` or `keepCursor === false`.
`hover` / `movecursor` still travel. `computer.status.act.keepCursor` is true.
No PostMessage ghost click (Chrome ignores it). No GPLv3 dump. No third-party MCP.
