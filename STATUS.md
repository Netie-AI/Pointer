# STATUS

**Hard cap: 60 lines.** Older narrative moves to CHANGELOG.md; it does not accumulate here.

## Now

0. **PR #1 and #35 are on main.** Spoken-strip comma+please Word
   writes stay recipes. Closed #3 #8-#25 stay closed.
1. **DR-0005 (founder).** HUD is screenshotable (settings v3). UACC READ
   skills in search. Loopback MCP `computer.status` / `observe` / `act` /
   `scribe` / `meeting_assist` plus `/api/computer` `/api/observe`
   `/api/scribe` `/api/meeting`. Observe returns live windows with screen
   rects (x y width height plus center); `?screenshot=1`
   adds a PNG and `?clipboard=1` pasteboard text (untrusted data). Act/scribe
   fail-closed without Cortex. Transcribe types into the remembered window.
   Scribe rewrites then pastes. Optional screen context. Esc cancels
   listening. Hold Ctrl+Alt+Space (release to stop; Linux stays toggle).
   Ctrl+Alt+M/L. Meeting Suggest, Recap, Follow-ups, Email, Actions pills. Live notes
   at `GET /api/meeting?notes=1`. Failed Scribe keeps a pending transcript
   so Retry or Paste as-is can finish (`POST /api/scribe` retry/dictate).
   Teach LINE, PATH, and BOX marks. `focus:` matches a window title; `click: Save`
   aims by name; `click window: notepad` aims at the window center.
   HUD Ask and MCP plan those verbs locally (still Cortex-gated).
   Autostart is a setting. `wait` / `scroll` / `doubleclick` / `rightclick` /
   `hover` / `replace:` plan locally. `focus: notepad then type: hello`
   chains local verbs. Ask captures a fresh screen (Clicky sees-what-you-see, overlay tokens). Ctrl+Enter is
   Cluely Assist (meeting say, or "what am I looking at"). Copy notes and
   `GET /api/meeting?export=1` share live markdown. Copy recap / Copy say /
   Copy email / Copy actions plus `?recap=1` `?say=1` `?email=1` `?actions=1` from main. MCP meeting
   assist captures a fresh screen unless `screenshot: false` (live suggest
   opts out). Live Say refreshes as notes grow. Meeting LIVE captions are
   fixed chrome, not cursor-following. Follow-ups land as clickable Ask chips (Cortex gated).
   Scribe/observe read focused selection via UIA and skip password boxes.
   Tray switches Agent/General/Transcribe/Scribe/Meeting without opening
   the HUD. Scribe has a standing rewrite instruction (HUD + settings;
   this take stays USER INSTRUCTION). Scribe screen context captures the
   remembered app window, not the full display. BYOK STT URL is a HUD
   setting (OpenAI-shaped HTTP; not a Deepgram default). BYOK LLM URL and
   model are HUD settings too (blank = loopback OpenVault; keys stay in
   OpenVault, never settings.json). HUD privacy and session chips name
   on-device vs off-device and Ready/Recording/Transcribing/Scribing.
   Recording, mode, and language hotkeys are settings. HUD lists 12
   Cluely languages; Ctrl+Alt+L still flips English/Traditional Chinese
   (English STT stays auto). Loopback status publishes live mode, hotkeys, STT, and LLM;
   `POST /api/computer {"mode":"scribe"}` switches like the tray.
   IBM Plex HUD. P-04 stays parked.
2. **Generative tools (DR-0004).** Search then craft a hint. Coordinator
   at `127.0.0.1:18010`. Public Worker is pages only. P-06 parked.
3. **EPIC-P04 and EPIC-P07 remain open.** No GPLv3 dump.

## Next

- Windows: `scripts/install_uacc.ps1` then prove UACC sees the HUD.
- Measure STT: `node scripts/stt_baseline.js`.
- `wrangler deploy` of `netie-host` when DNS/account is ready.

## Later

- OpenVault custody endpoint (TBD per `docs/CONTRACTS.md`).
- Skill harvest stays blocked (DR-0003). Third-party MCP servers stay P-05.
