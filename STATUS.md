# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **PR #1 and #35 are on main.** Spoken-strip comma+please Word
   writes stay recipes. Closed #3 #8-#25 stay closed. #46 is on main.
1. **DR-0006 (founder).** Pointer is Willow + Perplexity Computer HUD +
   OpenWorker home + DR-0005 coworker/UACC. Command bar matches
   `docs/ui-refs/perplexity-computer`. Computer theme is mint/white
   solid panels (no backdrop-filter). `~/.pointer` is the standing home.
   Rust `pointer-core` on `127.0.0.1:18011` takes click/move/wheel/type/tap/combo/keys;
   PowerShell is fallback. `computer.status.core` / `.home` publish it.
   Rest of the rust rewrite is P-08.
2. **Named UIA verbs.** `click:`/`invoke:` (InvokePattern),
   `fill:`/`type in:`/`set:` (ValuePattern), `toggle:`/`check:`/`uncheck:`
   (TogglePattern), and `expand:`/`collapse:` (ExpandCollapsePattern)
   keep the cursor put. Chrome miss falls back to SendInput. Password /
   leaf / non-toggleable is a visible no. Act still Cortex then reviewPlan.
3. **DR-0005 still holds.** Screenshotable HUD, UACC READ, IBM Plex,
   loopback `computer.status` / `observe` / `act` / `scribe` /
   `meeting_assist`. Act/scribe fail-closed without Cortex. Hands-free
   double-tap. Meeting pack. LIVE captions. Claude 5-hour then Cursor.
   BYOK STT/LLM (keys stay OpenVault). P-04 parked.
4. **Coordinator `127.0.0.1:18010`.** Public Worker is pages only.
   `/workspace` Run refuses (P-06). P-05 parked.
5. **EPIC-P04 and EPIC-P07 remain open.** No GPLv3 dump. Do not merge
   #41. #47-#56 still open (conflict with #46).

## Next

- Windows: `cargo build --release --manifest-path native/pointer-core/Cargo.toml`
  then prove click/move/wheel vs PowerShell.
- `scripts/install_uacc.ps1` then prove UACC sees the HUD.
- Measure STT: `node scripts/stt_baseline.js`.

## Later

- P-08 remaining rust (UIA, STT, HUD chrome). OpenVault custody TBD.
- Skill harvest stays blocked (DR-0003). Third-party MCP servers stay P-05.
- `wrangler deploy` of `netie-host` when DNS/account is ready.
