# three-OS packs (linux, win, mac)

keywords: electron-builder, AppImage, win zip portable, mac zip unsigned, pack:all, fail-closed Act, platform.js, xdotool, CGEvent, SendInput
main_idea: Ship Pointer HUD/overlay/host on linux, Windows, and Mac at the same time. SendInput Act stays Windows-only. Never invent xdotool or CGEvent.

## What shipped

- `electron-builder.yml` + `scripts/pack.js` / `pack-all.js`
- `electron/netie/platform.js`: packId, actOs, actRefuseReason, isOsAct
- CI matrix: windows-latest, ubuntu-latest, macos-latest
- Production linux/mac: no powershell spawn. Tests inject spawnImpl.

## Pack results on this Linux VM (2026-08-28)

- linux AppImage: `/workspace/dist/linux/Pointer-0.1.0.AppImage` (108M) + linux-unpacked
- win zip: `/workspace/dist/win/Pointer-0.1.0-win.zip` (112M) + portable exe (73M)
- mac zip: `/workspace/dist/mac/Pointer-0.1.0-mac.zip` (304M, unsigned; signing skipped off macOS)
- `/opt/cursor/artifacts` fuse store rejected files over ~100M (I/O error)

## Traps

- Concurrent packs must use private `directories.output` or they collide in `dist/`
- AppImage copy to the agent artifact store can fail; the build in `dist/` is the source of truth
- Fake spawnImpl is the unit harness, not a license to Act on linux/mac
