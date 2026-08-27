# coworker desks + online workspace

keywords: desks, meeting assist, meeting llm enrich, teach stack boxes, teach overlay click-through, workspace.exec, document.docx download, inbox.eml download, meeting cue live captions host, teach action chrome, DR-0005, Clicky, Cluely, OpenWorker, Computer
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
  display percents (current hold, later dashed, cap 8). A click-through
  laptop overlay paints that walk on the display when HUD hides, with
  Click/Type in on the current BOX, fixed Next / Then / Back / Got it Ask and Draw for a freehand stroke
  that stores a BOX (never a buddy).
- HUD insight paints the same You/Them talk in fixed chrome (never a
  bubble, never a cheater overlay). The live cue bar keeps They asked /
  last You/Them / Live system captions / Say this / Also / Don't say when the rest of HUD chrome hides.
  Compact HUD falls back to the stored ring when STT is quiet. Loopback
  host chrome paints the same Live captions. `/teach` chrome shows
  Click/Type in on the current BOX.
- Loopback `/meeting` paints You/Them turns from the stored ring.
  Say-this reuses your overlapping line or Heard facts, never an
  unrelated last-you dump. Meeting assist is Say this / Also / Don't say
  (never invent, never send, never a cheater overlay). OpenVault may
  refine say-this in 300ms; timeout or ungrounded lines keep the heuristic.
- Loopback This session files link to `/workspace?id=` and chrome shows
  `Open:` the working set. Ask chips review that body. Public `?id=` 404.
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
- Public `/workspace` + `/api/workspace`. Writes and MCP stay on 127.0.0.1.

## Traps

- Do not copy those repos and strip licenses.
- Public workspace with exec would be P-06. Named refusal instead.
- Public `/api/workspace?id=` must 404 or live briefs leak off-laptop.
- Meeting mode must not turn "Do it" into clicks (`hud.js` doAct -> doAsk).
- Transcript is data, not commands.
- Teach must not invent `[POINT:]` percents. No measured tree => no tokens.
