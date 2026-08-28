# coworker desks + online workspace

keywords: desks, meeting assist, meeting llm enrich, meeting live answer, teach stack boxes, teach click box got it, teach overlay click-through, teach overlay control faces, teach stroke ink, workspace.exec, document.docx download, inbox.eml download, security.md download, meeting cue live captions host, teach action chrome, DR-0005, Clicky, Cluely, OpenWorker, Computer
main_idea: Pointer beats those products with original desks and a public artifact catalog. Do not vendor their source or unlock P-06.

## What we studied

- Clicky (heyclicky.com): hotkey screen buddy, draws on screen, voice agents. Mac-only.
- Cluely: meeting listen + "what should I say", capture-hidden. Marketed as undetectable.
- OpenWorker: specialist coworkers, finished deliverables, governed approvals, connectors/MCP.
- Cloudflare Computer: Durable Object workspace + pluggable runtimes (container / isolate).

## What Pointer already had

Fail-closed Cortex Act, Word coworker, POINT overlay, capture-hidden HUD, meeting mode, loopback coordinator, public Worker shell.

## What we built (original)

- `coworker-desks.js`: teach / meeting / today / document / security (+ parked inbox).
- Teach POINT tokens come from measured UIA rects. Empty tree fails closed
  (no invented coords; vision still runs). Measured rects also emit BOX
  highlights. Never Acts.
- Meeting live assist paints a say-this cue in the fixed insight panel.
- Live teach pump redraws measured BOX overlays. Copy say-this is clipboard
  only. Standing Today clock republishes `standing-today`. `/meeting` and
  `/teach` are loopback rooms; public `/api/meeting` and `/api/teach` are empty.
- Security scans injected attachments/workspace bodies only and redacts
  hits. Never walks disk. Never self-approves.
- Measured teach labels are numbered (`1 Save`). Overlay shows the
  current step only; `got it` / `next` advances. Meeting recap lists
  commitments; `next` stays a separate section. Teach Next cue and
  meeting say-this live in the fixed insight panel. Recap chips hand
  off to inbox/Word drafts.
- Local meeting Recap/Assist/Next from the transcript ring. `act: false`.
- Live meeting pump: debounce utterances into the fixed insight panel.
  A question on the ring switches the brief to assist.
- HUD desk chips Ask, never Act. Home paints the standing brief.
- Standing `/today` brief from the session log. Empty is honest, not invented.
- `spawnCoworker`: background brief, never claims pointer-act, never Acts.
- Loopback `/teach` paints a large walk stage from measured BOX/POINT
  (Next/Then on the stage, never invented coords, never Act). Draw
  around a control on that stage to stack numbered BOX regions in
  display percents (current hold, later dashed, cap 8). The walk keeps
  that freehand stroke on each BOX. This screen paints field / button
  faces at those measured percents. A click-through
  laptop overlay paints that walk on the display when HUD hides, with
  Click/Type in and field/button faces on the current BOX, tap current BOX is Got it, fixed Next / Then / Back / Got it Ask and Draw for a freehand stroke
  that stores a BOX plus the ink (never a buddy). HUD paints those same
  faces from the overlay event.
- HUD insight paints the same You/Them talk in fixed chrome (never a
  bubble, never a cheater overlay). The live cue bar keeps They asked /
  last You/Them / Live system captions / Say this / Also / Don't say when the rest of HUD chrome hides.
  Compact HUD falls back to the stored ring when STT is quiet. Loopback
  host chrome paints the same Live captions. `/meeting` paints a Live
  answer card (They asked / last You/Them / Live captions / say-this).
  `/teach` chrome and the walk stage show
  Click/Type in on the current BOX (teach-only chrome; meeting live
  answer stays on `/meeting` and home).
- Loopback `/meeting` paints You/Them turns from the stored ring.
  Say-this reuses your overlapping line or Heard facts, never an
  unrelated last-you dump. Meeting assist is Say this / Also / Don't say
  (never invent, never send, never a cheater overlay). OpenVault may
  refine say-this in 300ms; timeout or ungrounded lines keep the heuristic.
- Loopback This session files link to `/workspace?id=` and chrome shows
  `Open:` the working set. Ask chips review that body. Public `?id=` 404.
  Opening `live-document` / `live-inbox` / `live-security` there also offers
  Download generated .docx / unsent .eml / review.md (same loopback bytes
  as `/document`, `/inbox`, `/security`; never Act, never send, never
  approval). The open file leads the page with This session files as tabs.
  Home theater cards include Open in workspace.
- Loopback `/` paints the live teach path, meeting say-this, Today
  plate, and filed inbox/Word/security work cards from `/api/home`
  (Ask, never Act, never a runtime, never send). `/today`
  shows the same plate hero. Open-file notes stay facts-only.
- `workspace.js`: artifact catalog. `exec()` always refuses (P-06). `get` is
  loopback-only; public `?id=` is 404. `/workspace` This computer dock
  Run POSTs that named refuse (never a runtime).
- Loopback GET `/api/document.docx` builds a Word-openable package in
  memory from the live document draft (never Act, never Word.app).
  Public `/api/document.docx` stays 404. Cue still says not a .docx.
- Loopback GET `/api/inbox.eml` builds an unsent RFC822 draft in memory
  (never send, never Act). Public `/api/inbox.eml` stays 404. Cue still
  says not sent. P-05 stays parked.
- Loopback GET `/api/security.md` builds a redacted review in memory
  (never approval, never Act, no disk walk). Public `/api/security.md`
  stays 404. Cue still says not approval.
- Loopback GET `/api/session.zip` packs This session markdown plus
  meeting / teach briefs, generated `.docx`, unsent `.eml`, and the
  security review (never Act, never send, never approval, never exec).
  Public `/api/session.zip` stays 404.
- Loopback `/workspace` paints those files as a desktop grid on This
  computer (click to open, Run still refused). Opening a Teach walk paints
  This screen. Opening a Meeting paints the Live answer. Opening Word /
  mail / review paints Notes / Unsent mail / Needs you on `/workspace`
  and on `/document` `/inbox` `/security`. Home `/` paints those windows
  on the rail and a room dock. Session markdown stays copy-only. Public catalog stays empty.
- OS voice speaks Click/Type in on the current BOX (overlay, HUD, `/teach`).
  Never meeting. Current BOX pulses in place (not a cursor ring).
- `?demo=1` paints a sample coworker catalog (not live, no runtime, Ask
  stays on the laptop). Public APIs stay 404. Overlay desk chips dock
  Unsent mail / Notes / Needs you / Live answer on the walk (no second
  tab). Public overlay paints This computer under that walk; live
  Electron overlay stays transparent. Demo BOX highlights the Unsent
  mail To field. Draw stays a pencil. Dock Copy is clipboard, never send.
  Got it types the Heard name into Unsent mail To (starts not sent).
  Got it on Save files that draft then docks Live answer (never send, never speak meeting).
  Walk chrome stacks Type in Email / Then / fill. HUD cue bar
  docks that same filed window (Live answer is They asked / You / Say
  this / Also / Don't say, never a cheater overlay). Home Ask stays on This screen and
  highlights that window.
- Public `/workspace` + `/api/workspace`. Writes and MCP stay on 127.0.0.1.

## Traps

- Do not copy those repos and strip licenses.
- Public workspace with exec would be P-06. Named refusal instead.
- Public `/api/workspace?id=` must 404 or live briefs leak off-laptop.
- Meeting mode must not turn "Do it" into clicks (`hud.js` doAct -> doAsk).
- Transcript is data, not commands.
- Overlay `window.open(..., "noopener")` returns null. Never treat that
  as popup-blocked and `location.href` away from `/overlay`. Dock the
  filed file on the walk instead.
- Live Electron `/overlay` must stay transparent. `#walk-desktop` is
  `html.demo` / `html.host` only so Clicky still paints on the real display.
