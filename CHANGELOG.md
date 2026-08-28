# CHANGELOG

Append-only. Never edited, only added to. Newest first.

## 2026-08-28 - Copy proves the clipboard changed

Copy and copy-all record a clipboard baseline, copy, then verify so a
failed Ctrl+C cannot feed stale paste. Same integrity gate as Word
from-clipboard. Cortex then reviewPlan still gate. No GPLv3 dump. No
third-party MCP.

## 2026-08-28 - Observe LIVE captions for agents

Loopback `computer.observe` and `GET /api/observe?captions=1` return the
last LIVE speech lines as untrusted data (partials replace the tail).
Default observe still omits captions. Not commands. No Deepgram stream.
No GPLv3 dump. No third-party MCP.

## 2026-08-28 - Live captions from growing utterances

Cluely-class LIVE chrome now peeks the open utterance every 400ms and
paints a partial that replaces the pending tail. Finals still own notes,
scribe, and capture commands. Local engines only (no Deepgram stream,
P-04). `computer.status.session.partials` advertises the capability.
No GPLv3 dump. No third-party MCP.

## 2026-08-28 - Hands-free double-tap dictation

Willow-class: hold Ctrl+Alt+Space to talk, release to stop. A second press
inside 400ms keeps the take going without holding. Tap again or Esc or the
120s cap stops it. Linux dry-run stays tap-to-toggle. `computer.status`
publishes `session.dictate` and `hotkeys.handsfree`. No GPLv3 dump.

## 2026-08-28 - Meeting pack plus 120s dictation cap

Loopback `GET /api/meeting?pack=1` returns notes plus last recap / say /
email / actions as one markdown pack (Cluely shareable notes, one hop).
Empty pack is a refusal, not a blank file. Public host GET `/api/meeting`
stays the empty catalog; the live pack stays on 127.0.0.1. Global
Ctrl+Alt+Space now auto-stops at 120s even on Linux tap-to-toggle (same
cap as HUD hold-to-talk). `computer.status.session.maxMs` publishes that
cap. No GPLv3 dump. No third-party MCP.

## 2026-08-28 - Merge main into detectable HUD branch

Keeps loopback `computer.*` (UACC, 12 languages, meeting email/actions) plus
coworker desks / This computer from main. GitHub CI is still a spending-limit
cutoff; local `npm test` and `npm run test:acceptance` are the gate. No GPLv3
dump. No third-party MCP.

## 2026-08-28 - Home is windows; This computer holds the catalog

Loopback `/` no longer paints the desks catalog dump. Workspace poller
runs on `/workspace` only. Session markdown stays copy-only. Today plate
is the standing brief (copy still files the markdown). Never Act. P-05
and P-06 stay parked.

## 2026-08-28 - Home paints filed windows and a room dock

Loopback `/` paints Notes / Unsent mail / Needs you as windows on the
rail. Rooms is a dock of links, not a markdown dump. Meeting and teach
rooms no longer dump the brief under the card. Never Act. P-05 and P-06
stay parked.

## 2026-08-28 - Unsent mail To is a Heard name

Inbox drafts put `To:` from their Heard name, or `not sent` when the
ring has none. Never invent. Never send. Notes paper skips recap
metadata. Home cards use the same kickers. P-05 and P-06 stay parked.

## 2026-08-28 - Desk rooms paint Notes, unsent mail, and Needs you

Loopback `/document` paints a Notes window. `/inbox` paints Unsent
mail (never send). `/security` paints Needs you (never approve). Same
windows as This computer. Never Act. P-05 and P-06 stay parked.

## 2026-08-28 - This computer opens Notes, unsent mail, and Needs you

Opening a Word file on `/workspace` paints a Notes window. Opening
unsent mail paints To / Subject / body (never send). Opening a review
paints Needs you (never approve). Never Act. Never a runtime. P-05 and
P-06 stay parked.

## 2026-08-28 - This computer opens teach and meeting windows

Opening a Teach walk on `/workspace` paints This screen (field / button
faces at measured percents). Opening a Meeting paints the Live answer.
Got it still Asks. Never Act. Never a runtime. P-05 and P-06 stay parked.

## 2026-08-28 - Overlay paints measured field and button faces

Laptop teach overlay and HUD paint field / button faces at measured
BOX percents (same catalog as `/teach` This screen). Never invented
coords. Tap current BOX is still Got it. Never Act. Never a buddy.
P-05 and P-06 stay parked.

## 2026-08-28 - Teach This screen shows measured controls

Loopback `/teach` paints field and button faces at measured BOX percents
(This screen). Never invented coords. Click current BOX is still Got it.
Opening a Word or unsent file offers the generated download from the
draft body, not only `preview`. Never Act. P-05 and P-06 stay parked.

## 2026-08-28 - Workspace files sit on This computer

Loopback `/workspace` paints This session files as a desktop grid on
This computer. Click a tile to open the file. Run is still a named
refuse (P-06). Never Act. Public catalog stays empty. P-05 stays parked.

## 2026-08-28 - Download packet is the finished session zip

Loopback GET `/api/session.zip` packs This session markdown plus meeting /
teach briefs, generated `.docx`, unsent `.eml`, and the security review.
Never Act. Never send. Never approval. Never exec. Public catalog stays
404. P-05 and P-06 stay parked.

## 2026-08-28 - Teach chrome stays teach-only

Loopback `/teach` sticky chrome hides meeting They asked / Live captions
/ Don't say. Then / Got it stay. `/meeting` and home keep the live
answer. HUD teach briefs skip Live captions. Never Act. Never a buddy.
Never a cheater overlay. P-05 and P-06 stay parked.

## 2026-08-28 - Meeting live answer and teach action labels

Loopback `/meeting` paints a Live answer card: They asked, last You/Them,
Live captions, and say-this. `/teach` stage and overlay chrome show
Click/Type in on the current BOX (not `Next: N of M`). Never Act. Never
a stealth overlay. Never a buddy. P-05 and P-06 stay parked.

## 2026-08-27 - Teach walk keeps the freehand stroke

Loopback `/teach` and the overlay keep the drawn polyline on each BOX
(not only the bounding rect). Later ink stays dashed. Never Act. Never
a buddy. Public catalog stays empty. P-05 and P-06 stay parked.

## 2026-08-27 - Loopback /security downloads a generated review

Loopback GET `/api/security.md` returns a redacted markdown review from
the live security desk (never approval, never Act, no disk walk). Empty
review is 404. Public catalog stays 404. Cue still says not approval.
P-05 and P-06 stay parked.

## 2026-08-27 - Workspace open file keeps This session as tabs

Loopback `/workspace?id=` paints This session files as tabs on the open
file. Switching tabs opens that file. Never exec. Never Act. Public
catalog stays 404. P-05 and P-06 stay parked.

## 2026-08-27 - Click the current teach BOX to Got it

Loopback `/teach` treats a tap inside the current BOX as `i clicked`
(Ask, never Act). A drag still stacks a drawn step. Overlay `?demo=1`
does the same on the hold BOX. Real overlay stays click-through.
Never a buddy. P-05 and P-06 stay parked.

## 2026-08-27 - Open workspace file leads the Computer catalog

Loopback `/workspace?id=` hoists the open file above desks and Run.
Finished .docx / unsent .eml stay on that file. Never Act. Never send.
Public catalog stays 404. P-05 and P-06 stay parked.

## 2026-08-27 - Workspace opens finished .docx and .eml files

Loopback `/workspace?id=live-document` downloads the generated .docx.
`/workspace?id=live-inbox` downloads the unsent .eml. Home work cards
link Open in workspace. Never Act. Never send. Public catalog stays 404.
P-05 and P-06 stay parked.

## 2026-08-27 - Host chrome keeps Live captions and Click/Type in

Loopback host cue bar paints Live captions from the stored meeting ring
(skips They asked / last Them). `/teach` chrome shows Click/Type in on
the current BOX. HUD compact cue falls back to the same ring when STT
is quiet, and strips N of M from the teach action. Never Act. Not a
stealth overlay. P-05 and P-06 stay parked.

## 2026-08-27 - Loopback /inbox downloads a generated .eml

Loopback GET `/api/inbox.eml` returns an unsent RFC822 draft from the
live inbox (never send, never Act). Empty draft is 404. Public catalog
stays 404. Cue still says not sent. P-05 and P-06 stay parked.

## 2026-08-27 - Loopback /document downloads a generated .docx

Loopback GET `/api/document.docx` returns a Word-openable package from
the live document draft (never Act, never Word.app). Empty draft is 404.
Public catalog stays 404. Cue still says not a .docx. P-05 and P-06 stay
parked.

## 2026-08-27 - Teach overlay labels Click/Type in on the current BOX

Click-through teach overlay paints Click / Type in / Look at on the
current hold BOX (Tab/Enter when measured). Later boxes stay numbered
and dashed. BOX tokens stay `1 Save`. Never Act. Not a buddy.
P-05 and P-06 stay parked.

## 2026-08-27 - Compact HUD keeps Live captions from system STT

HUD live cue bar paints last system STT lines as Live captions when
the rest of HUD hides. Duplicate They asked / Them lines stay off.
Not a floating LIVE bar, not a stealth overlay. P-05 and P-06 stay
parked.

## 2026-08-27 - Workspace Run is a named Computer refuse

Loopback `/workspace` keeps a This computer dock. Run POSTs
`/api/workspace/exec` and always fails closed (P-06). Public catalog
shows the same refuse. Never Act. Never a runtime. P-05 stays parked.

## 2026-08-27 - Meeting cue keeps last You/Them when HUD hides

HUD live cue bar keeps last You/Them with They asked / Say this /
Also / Don't say as fixed top chrome when the rest of HUD hides.
Not a bubble, not a peek orb, not a stealth overlay. P-05 and P-06
stay parked.

## 2026-08-27 - Teach Draw is a freehand stroke that stores a BOX

Click-through teach overlay Draw traces a stroke; Pointer stores the
bounding BOX (current hold, later dashed). Tiny scratches fail closed.
Cap 8. Loopback `/teach` draws the same way. Never Act. Not a buddy,
not a ring, not a stealth meeting overlay. P-05 and P-06 stay parked.

## 2026-08-27 - Meeting cue stays when HUD chrome hides

HUD live cue bar keeps They asked / Say this / Also / Don't say as
fixed top chrome when the rest of HUD hides (Ask, never Act). Not a
bubble, not a peek orb, not a stealth overlay. P-05 and P-06 stay
parked.

## 2026-08-27 - Teach overlay Add box stacks a drawn step

Click-through teach overlay Add box lets you drag the next BOX on
the live display (current hold, later dashed). Tiny drags fail
closed. Cap 8. Overlay Got it advances the stored walk. Never Act.
Not a buddy, not a ring, not a stealth meeting overlay. P-05 and
P-06 stay parked.

## 2026-08-27 - Teach overlay Back / Got it Ask without HUD

Click-through teach overlay keeps a fixed Next / Then bar with
Back / Got it (Ask, never Act). The rest of the display stays
click-through. Not a buddy, not a ring, not a stealth meeting
overlay. P-05 and P-06 stay parked.

## 2026-08-27 - Teach BOX overlay stays click-through on the display

Held teach walks paint current BOX and later dashed boxes on a
click-through display overlay (Ask, never Act). HUD hide does not
clear it; reset / empty walk does. Frame drag still owns the mouse.
Not a buddy, not a ring, not a stealth meeting overlay. P-05 and
P-06 stay parked.

## 2026-08-27 - Teach stacks drawn BOX steps

Loopback `/teach` stacks each drag as the next numbered BOX
(current hold, later dashed, Got it Ask). Cap 8. Tiny drags
fail closed. HUD Frame empty tree stays this region. Public
POST stays 404. Overlay stays on the laptop HUD. P-05 and
P-06 stay parked.

## 2026-08-27 - Teach stage is a drawable BOX walk

Loopback `/teach` lets you drag a box on the stage. That region becomes
the current BOX in display percents (never invented, never Act). Tiny
drags fail closed. Public POST `/api/teach` stays 404. Overlay stays on
the laptop HUD. P-05 and P-06 stay parked.

## 2026-08-27 - Meeting OpenVault enrich stays grounded

OpenVault may refine meeting say-this in 300ms. Timeout, missing
OpenVault, or an ungrounded line keeps the local Say this / Also /
Don't say heuristic. Never invents. Never a stealth overlay. Never
Acts. Public copies stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - Meeting assist is Say this / Also / Don't say

Loopback `/meeting` and HUD insight paint a grounded suggestion stack
(Say this, Also from Heard, Don't say / don't send). Never invents.
Never a last-you dump. Never a stealth overlay. Never Acts. Public
copies stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - Home paints filed inbox, Word, and security cards

Loopback `/` paints unsent follow-up, Word draft, and security review
cards next to the teach path, meeting say-this, and Today plate (Ask,
never Act, never a runtime, never send, never a .docx, never self-approve).
Desk rooms `/inbox` `/document` `/security` show the same cards.
Public copies stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - Home paints the Today plate

Loopback `/` paints On your plate next to the teach path and meeting
say-this (Ask, never Act, never a runtime). `/today` shows the same
hero. Open-file notes stay facts-only and label From the open file.
Public copies stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - Home paints the live session theater

Loopback `/` paints the live teach path and meeting say-this card from
`/api/home` (Ask, never Act, never a runtime). Public copies stay empty.
P-05 and P-06 stay parked.

## 2026-08-27 - Meeting answer card; open file grounds Heard

Loopback `/meeting` paints a say-this answer card (They asked / say-this /
Heard). An open workspace file grounds Heard facts only, never talk turns,
never a stealth overlay, never Act. Public copies stay empty. P-05 and
P-06 stay parked.

## 2026-08-27 - Teach walk path (current hold, later dashed)

Loopback `/teach` paints the measured walk path: current BOX held,
later dashed, numbered rail, Tab/Enter/Space key on the current step
(Ask, never Act, never invented coords). HUD overlay dashes later boxes
the same way. Public copies stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - Teach walk stage on loopback /teach

Loopback `/teach` paints a large walk stage from measured BOX/POINT
(Ask, never Act, never invented coords). Next/Then sit on the stage.
Public copies stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - HUD paints You/Them talk in insight chrome

HUD insight panel paints the stored You/Them talk track (Ask, never Act,
never a bubble, never a cheater overlay). Say-this stays grounded.
Public copies stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - Meeting talk track; say-this stays grounded

Loopback `/meeting` paints You/Them turns from the stored ring (Ask,
never Act, never a cheater overlay). Say-this reuses your overlapping
line or Heard facts, never an unrelated last-you dump. Public copies
stay empty. P-05 and P-06 stay parked.

## 2026-08-27 - Workspace file links are the working set

Loopback This session files open `/workspace?id=` as the working set.
Chrome shows Open: the file title. Review file / Draft email Ask that
body (never Act). Public `?id=` stays 404. P-05 and P-06 stay parked.

## 2026-08-27 - Open workspace file Ask chips

Loopback `/workspace` opens a file as the working set. Review file /
Draft email / Write in Word Ask against that body (never Act). Desk
rooms `/security` `/document` `/inbox` get the same chips. `this file`
scans only the open artifact. Public `?id=` stays 404. P-05 and P-06
stay parked.

## 2026-08-27 - Host Ask bar and Today chips

Loopback sticky chrome keeps a fixed Ask bar on every page (never Act,
never a floating buddy). `got it` / `back` still advance a stored teach
walk. `/today` chips file Recap / mail / Word / security the same way.
Public POST `/api/ask` stays 404. P-05 and P-06 stay parked.

## 2026-08-27 - Host meeting chips file inbox and Word

Loopback `/meeting` Ask chips (Assist / Draft email / Write in Word)
file unsent mail and a Word draft from the stored transcript. Teach
walks stay on `/teach`. Public POST `/api/meeting` stays 404. Never
sends. Never a .docx. Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Fixed live cue bar on loopback host pages

Loopback host pages paint They asked / Heard / Next in sticky chrome
from `/api/home`, with Back/Got it Ask (never Act). Public copies hide
the bar. Today plate stays commitments only. P-05 and P-06 stay parked.

## 2026-08-27 - Host teach Got it; Today plate is commitments

Loopback `/teach` Back/Got it Ask the next measured control from a
stored walk (never Act, never invents coords). Public POST `/api/teach`
stays 404. Copy next / Copy say-this / Copy plate copy the cue line.
Today plate reads your commitments, not the meeting say-this dump.
Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Teach keys, downloadable briefs, named Word notes

Teach cues name the key (`Type in Email then Tab`, `Click Save or press
Enter`). Loopback desk pages and workspace artifacts copy/download as
markdown files. Meeting spawn Word notes title `Notes with Sarah Chen`.
Never a .docx without Cortex. Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Heard orgs, download session, copy teach walk

Meeting Heard lists spoken orgs (`from Acme` / `I work at Stripe`) from
the ring. Who-asks say `Sarah Chen at Acme`. Unsent mail confirms
`with Acme`. Loopback `/` and `/workspace` download the session file.
`/teach` copies the walk SOP. Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Inbox greets Heard names; Copy session file

Unsent follow-up drafts greet with their name from the ring (`Hi Sarah
Chen,`) and confirm Heard dates/amounts. Copy session copies the This
session markdown from `/` and `/workspace` (clipboard, never Act).
Never sends. Never invents. P-05 and P-06 stay parked.

## 2026-08-27 - Session file on the page and Heard names

Loopback `/` and `/workspace` paint the This session markdown as a
readable file (`#session-md`, textContent only). Meeting Heard also
lists spoken names (`I'm Alex` / `this is Sarah`) from the ring and
never treats `I'm going Friday` as a name. Never Acts. P-05 and P-06
stay parked.

## 2026-08-27 - session.live MCP and spawn security review

Loopback MCP `session.live` returns the This session catalog as markdown
plus file links. Meeting spawn also files a security review of those
injected briefs (redacted, no disk). Public `/mcp` stays 404. Never Acts.
P-05 and P-06 stay parked.

## 2026-08-27 - This session catalog on home and workspace

Loopback `/` and `/workspace` show a This session catalog: They asked,
Heard, say-this, plate, and links to filed meeting/inbox/Word briefs.
Public copies stay empty. No runtime. Never Acts. P-05 and P-06 stay
parked.

## 2026-08-27 - Say-this weaves Heard; Today lists filed drafts

Meeting say-this folds Heard clock times and amounts into the speakable
line (`We'll ship Friday for $40k`). A date or budget question with no
answer still uses Heard facts from the ring, never invents. Today plate
lists filed inbox/Word drafts from a meeting spawn. Never Acts. P-05
and P-06 stay parked.

## 2026-08-27 - Heard clock times and meeting spawn recap

Live meeting Heard strip also lists clock times (`3pm` / `15:00`) from
the ring. Bare spawn during Meeting/Transcribe recaps the call (and
still files unsent mail plus a Word draft). Never Acts. P-05 and P-06
stay parked.

## 2026-08-27 - Meeting spawn files mail and Word drafts

Spawn of a meeting recap also ships an unsent follow-up and a Word
draft as workspace artifacts. HUD cue stays on They asked / Heard.
Never sends (P-05). Never a .docx without Cortex. Never Acts. P-06
stays parked.

## 2026-08-27 - Meeting Heard strip from the ring

Live meeting extracts dates and amounts from the transcript into a Heard
strip (`Friday / $40k`). HUD top bar and loopback `/meeting` show it.
Never invents. Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Live cue stays in the top bar with chat closed

Walk and meeting say-this paint Next / Then / They asked / Got it in
fixed top chrome, not only in the insight panel. Chat can stay compact
so the screen stays usable. Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Framed Walk boxes the region without UIA

HUD Walk still points when the control tree is empty: the overlay boxes
the framed region in display percents, not invented control coords.
UIA points stay display-relative so a crop walk lands on the HUD.
Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - HUD Walk frames a region then teaches it

HUD Walk/Frame captures a region and starts a teach walk (Ask, never
Act). Tray Frame stays capture for Act. Remaining steps persist as
`rest` and `/teach` shows `Then:`. P-05 and P-06 stay parked.

## 2026-08-27 - Word drafts from live recap and They asked insight

Bare `write in Word` reuses the live meeting recap or Today plate as a
draft, not a `.docx`. Insight chrome prefers They asked / Plate. Never
Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Teach Then-path and spawn Today plate

Teach HUD shows `Then: Click Save / Click Cancel` for remaining steps.
Bare `spawn a coworker` runs the Today plate in the background, never Act.
P-05 and P-06 stay parked.

## 2026-08-27 - They asked chrome and Today plate

Fixed HUD and loopback `/meeting` show `They asked` above say-this. Today
lists On your plate from live commitments and never invents work on the
public catalog. Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Teach Click/Type walk and 300ms question cue

Teach walks fields, then the primary CTA, then dismiss (`Type in Email` then
`Click Save`). Meeting questions land a say-this in 300ms. Never Acts.
P-05 and P-06 stay parked.

## 2026-08-27 - Primary teach walk and speakable say-this

Teach walks the primary CTA first (Save before Cancel). Meeting say-this is a
speakable line (`We'll ship Friday`) from your answer, never sent. Never Acts.
P-05 and P-06 stay parked.

## 2026-08-27 - Teach Got it chrome and due-tagged recap

Fixed insight chrome shows Back / Got it during a teach walk (Ask, never Act).
Teach cue is `N of M Label`. Recap tags You/Them with a weekday when heard.
Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Speaker recap, hold teach overlay, teach map

Meeting recap labels You vs Them. Say-this prefers what you said after they
asked, and stays honest when you have not answered. Teach overlay holds the
current measured control until `got it` or a mode change. Loopback `/teach`
draws a read-only box map from measured markers (not a runtime). Never Acts.
P-05 and P-06 stay parked.

## 2026-08-27 - Live inbox and document rooms

Home lists every desk. Loopback `/inbox` is an unsent draft grounded in
meeting commitments and decisions (P-05). `/document` is a Word draft,
not a `.docx`. Public catalog stays empty. MCP `inbox.live` and
`document.live` never Act. P-05 and P-06 stay parked.

## 2026-08-27 - Live coworker home, security room, meeting decisions

Home `/api/home` lists live teach/meeting/today/security rooms. Loopback
`/security` shows injected-file review (`live-security`); public
`/api/security` stays empty. Recap lists `## Decisions`. HUD Review cue
is `cueKind: warn` (never Act, never self-approve). MCP `security.live`
is first-party. P-05 and P-06 stay parked.

## 2026-08-27 - Teach walks one control at a time

Teach overlay shows the current measured control only. `got it` / `next`
advances, `back` goes back. Live coworker cue also paints the insight
summary (fixed chrome, not a bubble). Never Acts. P-05 and P-06 stay
parked.

## 2026-08-27 - Live HUD cues, meeting coaching, desk handoffs

Teach paints a Next cue (`1 Save`) in fixed HUD chrome with the live
brief; meeting recap keeps say-this when a question is still open.
Suggest chips hand off to a follow-up email draft and a Word recap
draft (never send, never write without Cortex). Loopback `/teach`
shows the next-control cue. Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Injected secret review, numbered teach, /teach room

Security desk scans HUD attachments and workspace bodies only, redacts
hits, never walks disk, never self-approves. Measured teach labels are
numbered (`1 Save`). Recap lists `## Commitments`; next-steps stays a
separate ask. Loopback `/teach` shows `live-teach`; public `/api/teach`
stays empty. First-party MCP `security.review` and `teach.live` never
Act. P-05 and P-06 stay parked.

## 2026-08-27 - Live teach pump, copy say-this, standing Today clock, /meeting room

Teach keeps redrawing measured BOX overlays while the desk is live.
Meeting cue copies to the clipboard from fixed HUD chrome (never Acts).
A standing Today clock republishes the session brief. Loopback `/meeting`
shows the live brief; public `/api/meeting` stays empty. P-05 and P-06
stay parked.

## 2026-08-27 - Measured BOX overlay, live say-this cue, loopback catalog poll

Teach draws around measured UIA rects (`[BOX:left,top,w,h:label]`) plus the
existing POINT crosshair. Empty trees still invent nothing. Meeting assist
puts a say-this cue in the fixed insight panel (not a floating bubble).
Loopback host pages poll while live; public localFirst snapshots do not.
Never Acts. P-05 and P-06 stay parked.

## 2026-08-27 - Teach points from measured controls, never invented

Teach walkthroughs emit `[POINT:x,y:label]` from UI Automation bounding
rects (percent of the capture). No tree, no coordinates, vision still
runs. Overlay is the existing crosshair. Never Acts. First-party MCP
`teach.point` is the same rule with injected controls; unknown tools
still refuse. P-05 and P-06 stay parked.

## 2026-08-27 - Live assist on questions, desk chips, coworker home

A question on the transcript ring switches the live meeting pump to
assist and drafts a grounded reply (never sent). Fixed HUD desk chips
Ask, never Act. Home paints the standing brief instead of a JSON dump.
Workspace artifacts filter by title/desk. P-05 and P-06 stay parked.

## 2026-08-27 - Live meeting brief and read-only artifact browser

Meeting/Transcribe utterances debounce into a live recap in the fixed
insight panel (`live-brief`). Empty transcript fails closed. Agent mode
does not pump. Loopback `/api/workspace?id=` opens an artifact body;
public id fetches 404. `/lanes` and `/skills` paint cards, not JSON.
MCP `workspace.get` is first-party and never Acts. P-05 and P-06 stay
parked.

## 2026-08-27 - Standing Today brief and fail-closed coworker spawn

`/today` is a standing brief of this session (lanes, events, artifacts,
parked send/exec), not a JSON dump. Public `/api/today` stays local-first
and empty. Voice "spawn a coworker" queues a background brief behind the
LIVE bar and never claims pointer-act. Document desk drafts without
writing Word. MCP `today.brief` is first-party and never Acts. P-05 and
P-06 stay parked.

## 2026-08-27 - Teach walkthroughs, unsent inbox drafts, live follow-up chips

Teach requests publish a POINT-format walkthrough and still go to vision;
the brief never invents coordinates or restores a floating buddy. Inbox
drafts say not sent (P-05). Meeting recap paints follow-up questions into
the fixed HUD suggest row (`suggests` event). Still never Acts.

## 2026-08-27 - Public home is the coworker, not a coordinator dump

host.netie.ai paints the desk catalog on `/` as well as `/workspace`.
GitHub Actions still cannot start (org billing); CI watch on this branch
was dropped so billing failures stop paging the run.

## 2026-08-27 - Security desk ships a review brief, never a self-approved fix

`security review` produces a local checklist: hard floors, checks to run,
and an explicit "Pointer will not execute this." It publishes to the
workspace. The fixer is not the only checker. GitHub Actions still
cannot start (org billing).

## 2026-08-27 - Public /workspace is a desk catalog, not a JSON dump

host.netie.ai/workspace now paints teach/meeting/document/security cards
and an artifact list with textContent only. Exec true is refused in the
page. Live briefs still require the laptop coordinator. GitHub Actions
still cannot start (org billing).

## 2026-08-27 - Meeting stop writes a recap into notes and workspace

Stopping Meeting or Transcribe now runs `finishListeningSession`: a local
recap from the transcript ring, published to the loopback workspace and
appended as a Netie block in the markdown notes. Empty transcript fails
closed. Agent mode is not auto-recapped. Still never Acts.

## 2026-08-27 - Coworker desks and online workspace catalog (DR-0005)

Founder goal: Pointer as the coworker that replaces Clicky and Cluely,
stronger than OpenWorker, usable online like a Computer workspace.
Routed as a PRD amendment. Original code only - those repos were
studied, not vendored, and no license was stripped.

Four first-party desks (`teach`, `meeting`, `document`, `security`) pick
a job and a finished deliverable. Meeting Recap / Assist / Next run
from the armed transcript ring and never Act. Listening modes route
Do it to Ask. Loopback workspace stores briefs; public
`host.netie.ai/workspace` is a catalog with `exec: false`. First-party
MCP adds `desks.*` and `workspace.*`; `workspace.exec` is a named
refusal. P-05 and P-06 stay parked. Fail-closed Act and fixed HUD
chrome are unchanged.

## 2026-08-28 - Cluely 12-language STT/Scribe list

HUD language select lists 12 English labels (English, Traditional Chinese,
Spanish, Malay, Japanese, Korean, French, German, Portuguese, Italian,
Hindi, Arabic). English STT stays auto. Other picks pin an ISO code.
Ctrl+Alt+L still flips only English / Traditional Chinese. Loopback
`computer.status.scribe.languages` publishes the list. No GPLv3 dump.
No third-party MCP.

## 2026-08-28 - Ask emits Clicky overlay tokens

visionChat tells the model to include POINT/LINE/PATH/BOX percents so the
HUD can draw a teach frame. Tokens stay stripped from chat. Still never
acts from screen text. GitHub CI on this account is still a spending-limit
cutoff (0 steps), not a product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-28 - Clicky BOX teach frames on the HUD

HeyClicky-class overlay: Ask answers may include `[BOX:x,y,w,h:Save]` (or RECT)
to frame a control. Click-through, solid type, no glass. POINT/LINE/PATH stay.
GitHub CI on this account is still a spending-limit cutoff (0 steps), not a
product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-28 - Meeting action items from main

Cluely-class Actions: meeting-only Actions / Copy actions pills. `kind`
actions lists owner, task, and due date. `GET /api/meeting?actions=1`
shares the last list from main, not the renderer. Empty stays a refusal.
Still Cortex-gated to produce. GitHub CI on this account is still a
spending-limit cutoff (0 steps), not a product fail. No GPLv3 dump. No
third-party MCP.

## 2026-08-27 - Meeting follow-up email from main

Cluely-class Email: meeting-only Email / Copy email pills. `kind` email
drafts a pasteable follow-up. `GET /api/meeting?email=1` shares the last
draft from main, not the renderer. Empty stays a refusal. Still Cortex-
gated to produce. GitHub CI on this account is still a spending-limit
cutoff (0 steps), not a product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Meeting LIVE captions as fixed chrome

Cluely-class captions: in Meeting mode the LIVE bar shows system-audio
transcripts under the top bar. Agent boot stays empty. No cursor-follow
and no drag grip in meeting (DR-0002). Insights still keep the roll.
GitHub CI on this account is still a spending-limit cutoff (0 steps),
not a product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Copy last meeting Say from main

Cluely-class Copy say copies the last Suggest/Say from main, not the
renderer. `GET /api/meeting?say=1` shares the same text. Empty stays a
refusal. Still Cortex-gated to produce. GitHub CI on this account is
still a spending-limit cutoff (0 steps), not a product fail. No GPLv3
dump. No third-party MCP.

## 2026-08-27 - HUD Ask plans click window: locally

Ask and clicks:go use the same local verb planner as MCP. Recipes still
win. A window miss is a visible no, not an LLM guess. Plans from the
Ask text, not attached file bodies (#23). Still Cortex-gated. GitHub CI
on this account is still a spending-limit cutoff (0 steps), not a
product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - click window: uses observed screen rects

Agents can say `click window: notepad` (also doubleclick/rightclick/hover).
The local planner finds the titled window and clicks its center. Needs a
rect from observe/GetWindowRect. Absolute x/y skips vision re-aim so the
center is not thrown away. Still Cortex-gated. GitHub CI on this
account is still a spending-limit cutoff (0 steps), not a product fail.
No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Observe window screen rects for agents

UACC-class list_windows: computer.observe windows and foreground now
carry x y width height plus center cx cy. GetWindowRect on the input
worker; DIP conversion in main so clicks match. GitHub CI on this
account is still a spending-limit cutoff (0 steps), not a product
fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - HUD session chip Ready/Recording/Scribing

OpenWillow-class session: fixed top chrome names Ready, Recording,
Transcribing, Scribing, Paused, or Error. computer.status.session
matches so other agents can wait. Not an orb. GitHub CI on this
account is still a spending-limit cutoff (0 steps), not a product
fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - HUD privacy chip for STT and LLM

R-0011: fixed top chrome names on-device vs off-device STT and LLM.
Empty URLs stay loopback OpenVault/sidecar, not a silent cloud hop.
computer.status.privacy matches the chip. GitHub CI on this account
is still a spending-limit cutoff (0 steps), not a product fail. No
GPLv3 dump. No third-party MCP.

## 2026-08-27 - Copy last meeting recap from main

Cluely-class Recap copy: HUD Copy recap and GET /api/meeting?recap=1
read the last Cortex-gated recap in main. The renderer cannot supply
the paste payload. Empty stays a refusal. GitHub CI on this account
is still a spending-limit cutoff (0 steps), not a product fail. No
GPLv3 dump. No third-party MCP.

## 2026-08-27 - Language hotkey pins STT too

OpenWillow-class language: Ctrl+Alt+L / HUD Dictation+Scribe language
pins Whisper and sidecar STT to zh when Traditional Chinese is selected.
English stays auto so zh/en/ms mix is not forced to a single language.
GitHub CI on this account is still a spending-limit cutoff (0 steps),
not a product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Clickable meeting follow-ups

Cluely-class Follow-ups: numbered questions become Ask chips on the
Say strip. A click sends the question through doAsk (Cortex gated).
Chip labels are text, not HTML. GitHub CI on this account is still a
spending-limit cutoff (0 steps), not a product fail. No GPLv3 dump.
No third-party MCP.

## 2026-08-27 - BYOK LLM URL in settings

OpenWillow-class HTTP chat: HUD `llmUrl` / `llmModel` feed the OpenVault
chat hop (same pattern as NETIE_OPENVAULT_URL). Empty keeps loopback
OpenVault, not Groq. Remote URLs are labeled off-device. Custody inject
stays on OpenVault. Keys are never stored in settings.json. GitHub CI
on this account is still a spending-limit cutoff (0 steps), not a
product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Loopback mode switch and live status

Agents on 127.0.0.1 can read live mode, hotkeys, and STT URL from
`computer.status`, and switch Agent/General/Transcribe/Scribe/Meeting
with `POST /api/computer {"mode":"scribe"}` like the tray. Mode-only
is HUD state, not Cortex-gated. Clicks still fail-closed. GitHub CI
on this account is still a spending-limit cutoff (0 steps), not a
product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Customizable dictation hotkeys

OpenWillow-class shortcuts: recording, Transcribe/Scribe, and language
hotkeys persist in settings and rebind on save. They must stay distinct
and cannot steal Assist/Clicky/Escape. Hold-to-talk polls the recording
combo. GitHub CI on this account is still a spending-limit cutoff
(0 steps), not a product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - BYOK STT URL in settings

OpenWillow-class HTTP STT: HUD `sttUrl` feeds the sidecar slot (same
pattern as NETIE_STT_URL). Remote URLs are labeled off-device. Default
stays the loopback sidecar, not Deepgram (P-04). GitHub CI on this
account is still a spending-limit cutoff (0 steps), not a product fail.
No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Scribe screen captures the remembered window

OpenWillow-class screen context: Scribe matches the remembered hwnd/title
via Electron window sources and falls back to a display crop. Observe and
Ask stay full-display so agents can still see the HUD. No PrintWindow
dump. No GPLv3. GitHub CI on this account is still a spending-limit
cutoff (0 steps), not a product fail. No third-party MCP.

## 2026-08-27 - Standing Scribe rewrite instruction

OpenWillow-class Scribe: a persisted `scribeInstruction` applies to every
rewrite. The spoken or typed take stays USER INSTRUCTION. Default is
first-party English (no GPLv3 dump, no CJK in governed files). HUD field
next to writing style. GitHub CI on this account is still a
spending-limit cutoff (0 steps), not a product fail. No third-party MCP.

## 2026-08-27 - Tray switches Transcribe, Scribe, and Meeting

OpenWillow-class tray: radio items for Agent / General / Transcribe /
Scribe / Meeting call applyAppMode without opening the HUD. Mode
changes refresh the menu. GitHub CI on this account is still a
spending-limit cutoff (0 steps), not a product fail. No GPLv3 dump.
No third-party MCP.

## 2026-08-27 - Read selected text without copying a password

Scribe and `GET /api/observe?selection=1` read the focused selection
through UIA TextPattern. Password fields return empty and never get
Ctrl+C. Ctrl+C is only the fallback when UIA has no selection. GitHub
CI on this account is still a spending-limit cutoff (0 steps), not a
product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Meeting assist sees this screen unless asked not to

`computer.meeting_assist` and `POST /api/meeting` capture a fresh crop
so agents can ask about the call and the display. Live Suggest passes
`screenshot: false` so an 8s debounce does not screenshot the room on
a loop. GitHub CI on this account is still a spending-limit cutoff
(0 steps), not a product fail. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Shareable meeting notes as markdown

Cluely notes: `GET /api/meeting?export=1` returns markdown tagged as
untrusted data. HUD Copy notes pastes from the live file in main, not
from renderer text. Notes live opens that file. Public Worker still
404s `/api/meeting`. No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - Ctrl+Enter Assist asks about this screen or the live notes

Cluely Assist: global Ctrl+Enter shows the HUD and asks. Meeting mode
runs Suggest. An empty general Ask becomes "what am I looking at" with
a fresh crop. Shift+Enter stays a newline in the box. No GPLv3 dump.
No third-party MCP servers.

## 2026-08-27 - Chain local act verbs and capture the live screen on Ask

`computer.act` plans `focus: notepad then type: hello` as two local steps
(semicolon and newlines too). `type: hello then world` stays one type.
Ask (meeting and general) grabs a fresh display crop so the model sees
this screen, not a stale region. Retry/dictate Scribe still skip capture.
No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - Retry failed Scribe or paste the raw transcript

If Scribe cannot rewrite (no Cortex, empty model, paste miss), Pointer keeps
the voice take and remembered window. Retry re-runs the rewrite. Paste as-is
inserts the raw transcript. `POST /api/scribe {"retry":true}` /
`{"dictate":true}` plus `GET /api/scribe?pending=1`. Esc still cancels.
No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - Meeting recap, follow-ups, and live notes for agents

Meeting mode adds Recap and Follow-ups pills next to Suggest (fixed top
chrome, not a companion). `computer.meeting_assist` accepts `kind` say /
recap / followups. `GET /api/meeting?notes=1` returns the live transcript
as untrusted data, no model hop. Public Worker still 404s `/api/meeting`.
No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - Observe screenshot/clipboard and PATH teach strokes

`GET /api/observe?screenshot=1` plus MCP `computer.observe` with
`screenshot:true` return a PNG data URL so other agents can see this
screen. `?clipboard=1` returns pasteboard text tagged as untrusted data.
Teach overlay parses `[PATH:x,y;x,y]` freehand strokes (click-through).
No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - replace: backspaces then pastes into the remembered window

`replace: hello` restores the last user hwnd, sends Backspace, then clipboard
pastes. Unicode goes through paste, not a GPLv3 SendInput dump. CI on this
branch still never starts (GitHub billing / spending limit).

## 2026-08-27 - Hold Ctrl+Alt+Space to talk, release to stop

OpenWillow hold-to-talk: Electron still only sees the press, then a
GetAsyncKeyState poll stops listen when Ctrl+Alt+Space lifts. Dry-run and
Linux never report a physical hold, so those stay tap-to-toggle. Esc still
cancels. No GPLv3 dump.

## 2026-08-27 - Live meeting suggest and more agent drive verbs

`GET /api/tools` returns the MCP catalog over HTTP. `computer.act` plans
`wait`, `scroll up/down`, `doubleclick`, `rightclick`, and `hover` without a
second Cortex hop. Meeting mode refreshes a fixed Say line as notes grow
(debounce, fail-closed without Cortex). Public Worker still 404s `/api/tools`.
No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - Tool catalog so other agents know how to drive Pointer

`tools.list` still returns the name allowlist and now also a `catalog`
of descriptions plus JSON schemas. `computer.status.drive` lists the
loopback URLs and instruction verbs (`focus: notepad`, `click: Save`).
No third-party MCP servers.

## 2026-08-27 - Focus by title, named clicks, autostart

`focus: notepad` restores a matching window from the observe list.
`click: Save` aims by control name (UIA then vision). Observe can dump
foreground UIA controls when `elements:true`. Autostart at Windows
sign-in is a setting (OpenWillow pattern). No GPLv3 dump.

## 2026-08-27 - Live observe, Esc cancel, Scribe screen, meeting Suggest

`GET /api/observe` plus MCP `computer.observe` now return the foreground
window and a titled-window list so other agents can see this computer.
`open:` and `focus hwnd:` plan locally. Esc cancels Transcribe/Scribe
listen without a lifetime global grab. Optional Scribe screen context
(off by default, OpenWillow-class). Meeting mode has a Suggest pill.
Teach overlay parses LINE/ARROW strokes. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Loopback scribe and meeting APIs for other agents

MCP `computer.scribe` and `computer.meeting_assist` plus
`POST /api/scribe` `/api/meeting` on `127.0.0.1:18010`. Same Cortex
`/dms/secure` fail-closed gate as `computer.act`. Public Worker still
404s those paths. Ctrl+Alt+M flips Transcribe/Scribe; Ctrl+Alt+L
flips English / Traditional Chinese. `deliver:` restores the
remembered hwnd then pastes. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Global dictation hotkey and meeting assist

Ctrl+Alt+Space snapshots the current app then toggles Transcribe
listen (Electron cannot true-hold a shortcut). HUD hold-to-talk
refreshes that target. Meeting mode Ask (empty = what should I say)
uses live notes as untrusted data. No GPLv3 dump. No third-party MCP.

## 2026-08-27 - Remembered-window delivery, Scribe mode, instruction plans

Dictation and Scribe restore the last non-Pointer window (focus_hwnd)
then type or paste. Scribe is a first-class HUD mode: copy selection,
rewrite through the Scribe prompt, paste. `computer.act` turns an
instruction into a recipe or type/click/observe plan after Cortex
`/dms/secure`. Writing style and personal notes are settings, not a
GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - Gated computer.act and OpenWillow dictation delivery

Loopback `computer.act` (MCP + `POST /api/computer`) now runs Cortex
`/dms/secure` then plan-guard then reviewPlan. Observe can auto-run.
Clicks still need `approved:true`. MCP execution ignores the HUD mode
pill so other agents can drive the desktop. Transcribe dictation types
mic speech into the focused app after a session gate. Scribe prompt
grounds rewrite requests. No GPLv3 dump. No third-party MCP servers.

## 2026-08-27 - UACC skills, screenshotable HUD, classy type (DR-0005)

Founder amendment. `captureVisible` defaults on and migrates existing
installs (settings v3) so UACC and other agents can see Pointer.
First-party UACC READ skill catalog + observe recipes. Loopback MCP
tools `computer.status` / `computer.observe` and `GET /api/computer`.
`computer.act` is on the allowlist and refuses without Cortex
`/dms/secure`. HUD drops `backdrop-filter` liquid glass for IBM Plex
Serif + Sans solid panels. Windows install: `scripts/install_uacc.ps1`.
Does not bundle OpenWillow (P-04). Does not load third-party MCP
servers. P-05 coworker verbs stay parked.

Dictation mode aliases transcribe. "rewrite this" / "scribe this"
copies the selection (OpenWillow Scribe pattern, no GPLv3 dump).

## 2026-08-26 - Public host.netie.ai Worker shell (DR-0004)


Same pages as the loopback coordinator (`/` `/today` `/lanes` `/skills`).
The Cloudflare Worker (`workers/netie-host.js`, `wrangler.jsonc`) serves
that shell only. Public `/api/state` is a local-first snapshot with empty
lanes. Public `/mcp` is 404. Live claim/release and the first-party MCP
ABI stay on `127.0.0.1:18010`. This is not the compute box (P-06 stays
parked) and not a third-party MCP marketplace (P-05 stays parked). DNS
deploy waits on the Cloudflare account.

## 2026-08-25 - Generative tool ABI and local coordinator (DR-0004)

Stop enumerating a skill per scenario. Search Cortex
`/api/discovery/find-skills` plus local recipes; a miss writes a hint
draft with no executable actions (DR-0003 option B). First-party
JSON-RPC tools: skills.search / skills.craft / lanes.* / tools.list.
Unknown methods refuse. Loopback coordinator (`127.0.0.1:18010`)
serves `/` `/today` `/lanes` `/skills` for host.netie.ai. Lanes
pointer-act, cursor-cloud, cortex, craft claim/release so Cursor Cloud
and Cortex do not share the Act surface. Cloudflare/MacBook/VPS compute
box is P-06, not this PR. P-05 stays parked.

## 2026-08-25 - Merge PR #1; finish spoken-strip for comma+please Word writes

PR #1 (`netie-ecosystem-contracts` -> `main`) merged with CI green
(c9801ae). Remaining live miss after ee59600: trailing ", please"
left a comma so `writeInWord` failed `$` and "put hello in word,
please" took the clipboard stub. Strip optional comma before please.
Go now spoken-strips before `word:`, so "please word: hello" is act.
How/why Word questions stay ask instead of running the clipboard SOP.
add/append/insert prose uses `word_docx_write` (intent already claimed
those verbs). Closed #3 #8-#25 stay closed. Not harvest. Not #26.

## 2026-08-23 - Punctuated write-in-Word must not take the clipboard stub

`matchRecipe` anchored Word-write `$` on the raw input. Tests used
"write hello in Word" and passed. Live "write hello in Word." missed
the recipe (Go fell through to the LLM click/type planner). Live
"put hello in word." missed the write verb and matched the clipboard
stub, so the customer got from-clipboard-*.docx instead of "hello"
(R-0001).

Strip trailing .!? / please and leading can/could you / please before
the Word-write matchers. hud:act skills and LLM paths now return the
failed step the same way the recipe path does. `executeApproved` no
longer overwrites a coworker refusal insight with "Plan finished."

Closed #3 #10 #11 #14 #17 stay closed. Not harvest. Not PR #1 / #26.

## 2026-08-22 - Go/Act "write this in Word" must hit the coworker

`classifyIntent` treated "write a word document..." as code (`CODE_CUES`
includes "write a") and "write this in Word" as ask (`write` is not an
ACT_VERB). `clicks:go` only runs recipes on act. `matchRecipe` required
quotes / "that says" / `word:` and the clipboard pattern demanded to/into,
not in, so hud:act fell through to the LLM click/type planner.

The driver still returned `{ ok: true, ...result }` around a `reason`
refusal. executeApproved on PR #30 already prefers `outcome.reason`; this
maps `reason` to `error` at the driver and returns the failed step from
Go/hud:act so the HUD does not say Plan finished.

Closed #3 #10 #11 #14 #17 stay closed. Does not reimplement #31.

## 2026-08-22 - Merge-gate #30+#31 and pin unquoted write-in-Word

PR #30 (HUD Document ready) and PR #31 (recall 60s expiry) were both
CI-green and MERGEABLE alone. They conflict on STATUS and CHANGELOG.
This unused branch is the combined tree so a merge of one does not
drop the other. Closed #3 #10 #11 #14 #17 stay closed. Not PR #26. Not PR #1.

Attack pass on the combined tree:

- "write hello in Word" / "put hello in word" (no quotes) used to miss
  `word_docx_write` or take the clipboard stub. Deictic this/that/it
  still copies.
- `word_docx_*` driver returns now keep a refusal `ok: false` instead of
  writing `ok: true` first and hoping the spread overwrites it.
- Document ready now also requires `!driver.dryRun`. The ipc-bridge pin
  reads the `lastWordDocx = {` block, not the first `sendWordDocxReady`
  (that slice missed the dry-run guard on `4d57438`).

## 2026-08-22 - Dry-run must not raise Document ready; coworker refusals name the reason

`writeDocx({ dryRun: true })` returns ok + path without touching disk.
`executeApproved` still armed `lastWordDocx`, so Open pointed at a file
that was not written. Separately, coworker refusals carry `reason` and the
executor only read `error`, so the HUD said "failed: unknown" (R-0011).

Fix: skip `lastWordDocx` when `dryRun`; prefer `outcome.reason`; send the
failure as an insight. Closed #3 #10 #11 #14 #17 stay closed.

## 2026-08-22 - Document ready / Open survives the Act teardown

`executeApproved` sent `word-docx` mid-run, then `status done: true` in
`finally`, which hid the pill. The comment already said we re-raise the
artifact; the call was missing. Real use: file written, Open gone.
Closed #3 #10 #11 #14 #17 are not reopened. PR #27 is merged; this is the
next unused branch.

Fix: track `lastWordDocx`, call `sendWordDocxReady` AFTER `done`. The HUD
title carries the written preview (R-0001) and the sub still names the
destination (#19).

## 2026-08-22 - Recall retention clamp covers fallback; filenames stay integer epoch

Two remaining holes in the 60s-ring sweep on PR #31:

- `clampRetentionMs` capped only an explicit huge `retentionMs`. `0` / `NaN` /
  omitted fell back to `windowMs` uncapped, so a 99-day window with fail-closed
  retention unbounded the dir again.
- `_sealEviction` interpolated `frame.t` into the filename. A non-integer t
  wrote `recall-90000.7-*.enc.json`, which `SEALED_NAME` cannot parse, so
  `purgeExpired` never unlinked it. The ring now truncates to integer epoch ms
  from the injected clock (production stays on `Date.now()`; tests stay on the
  fake clock) and ignores readdir names that are not a basename.

Enforcer: `test/clicky.test.js`. Still not harvest, not a HUD toggle, not PR #26.

## 2026-08-22 - Sealed recall records expire with the 60s ring

DR-0003 fact 4, the named prerequisite for any skill-harvesting work. Not
harvest, not P-05, not a HUD toggle. New unused branch off
`netie-ecosystem-contracts` after #27. Does not attach to PR #26 (that
branch is based on pre-#27 `af25bb0` and is merge-dirty). Closed #3 #10
#11 #14 #17 stay closed.

The advertised feature is a 60s ring. The in-memory ring already bounded
itself (`maxFrames` + `windowMs`) by calling `_sealEviction`, which wrote
the evicted frame to `<dataDir>/recall/`. Nothing unlinked those files.
Independently verified earlier as R-0003: 4177 sealed records, 20 MB,
window-title timeline every 5-15s, on by default.

Two mechanics close it, both required so either regression turns the suite red:

- Time-expired evictions are dropped, not filed. Eviction is no longer
  persistence for a frame that has already aged out of the ring.
- `purgeExpired` sweeps `recall-<epochMs>-<uuid>.enc.json` older than
  `retentionMs` (default `windowMs`, fail-closed, hard-capped at the
  DATA_GOVERNANCE Tier X ceiling of 14 days) on construct, trim, and
  `stopFlush`. Foreign names in that directory are left alone. A leftover
  corpus from before this change is removed on the next launch.

`test/clicky.test.js` plants aged files, runs a 200-frame eviction, and
asserts the directory does not keep them. The stress burst does the same
with a vaulted ring. In-window count-eviction still dual-wraps (the existing
seal test still requires that).

Disclosure - a HUD control, off-by-default - remains open and is a PRD-agent
question, not this change.

## 2026-08-22 - Test fixture "recovered selection" must not land in Documents\\NetiePointer

Live confirm (file:line): customer artifact
`C:\\Users\\OoiJianHong\\Documents\\NetiePointer\\from-clipboard-1787382254896.docx`
body text is exactly `recovered selection`. That string is the retry fixture at
`test/clipboard-integrity.test.js:121` (af25bb0 `onCopy` return). Writer:
`electron/netie/word-coworker.js:133-141` `sanctionedRoot` ->
`Documents\\NetiePointer` when `NETIE_WORD_OUT_DIR` is unset.
`word_from_clipboard` ran with `dryRun: false` and asserted only `r.ok`.
Suites passed while real use opened the fixture. Closed #3 #10 #11 #14 #17
are not reopened.

Fix: `writeDocx` / `appendDocx` refuse when a `node test/....js` process has
no `NETIE_WORD_OUT_DIR`. `clipboard-integrity` now contains its sink and
asserts the unzipped `w:t` plus "customer folder unchanged".
`test/invariants/word-sink.test.js` pins both.

## 2026-08-22 - Word coworker real-use no longer writes a stub .docx

Laptop evidence (22 Aug 2026 MYT): `Documents\\NetiePointer\\from-clipboard-*.docx`
were all ~1158 bytes. Unzipping the latest showed an empty-looking
`word/document.xml` (`<w:t xml:space="preserve"></w:t>`). The HUD still said
Document ready. Closed tickets #3 #10 #11 #14 #17 are not reopened.

Cause, reproduced from this branch: `writeDocx` treated empty / whitespace as
success and built a 4-part OOXML stub Word does not render. The only shipped
Act path was the `terminal_to_word` recipe (`word_from_clipboard`). The
OpenVault planner prompt listed click/type/press only, so "write this in Word"
could not emit `word_docx_write`. A newline that differed from the clipboard
baseline passed `_provenCopy` and wrote the stub.

Fix (new ticket, new branch): refuse writes with no visible text; emit styles,
settings, and docProps so Word shows the body; route quoted / `word:` / "that
says" prose to `word_docx_write`; tell `_llmPlan` about the coworker verbs
(omit path). Tests assert the unzipped `w:t` the customer receives. R-0002:
no skipped tests. CI now also runs on PRs to `netie-ecosystem-contracts`
(the feature-PR base); a PR that never ran the matrix was a skipped test.

## 2026-08-22 - The smoke lane runs in CI, and the verified wave is closed

The 2026-08-20 entry ended on a caveat: #22's painted-geometry assertions lived
only in `test:smoke`, which CI declared NOT RUN, so a HUD regression could reach
`main` green. That caveat is resolved - `.github/workflows/ci.yml` gained a
dedicated `smoke` job on `windows-latest` (the OS the customer receives) that
downloads the Electron binary this one job needs and boots the real app. Run
32558187957 is green on all three jobs, and the smoke log shows all 25
assertions (15 hud-boot + 10 ipc-live) actually ran - not a degenerate pass.
The unit job's honest-coverage step now names what is still uncovered: smoke on
Linux, where no build ships.

With the caveat gone, `epic-agent` re-derived completeness from the code (not
from checkboxes) and closed tickets #8-#17, #19, #21-#25 and epics P01, P02,
P03, P05, P06 - each close citing its pinning suite, the mutation pass, and CI
run 32558187957. EPIC-P04 stays open on the founder's engine choice (OpenWillow
vs TurboOCR); EPIC-P07 stays open, blocked cross-repo (AirGPT / DMS).

One correction to the 2026-08-20 claim, found in the closing pass: six of the
sixteen mutations were the #17 gates written in that same pass, so "verified by
a run that wrote none of them" overstates #17. Its independent verification
(R-0003) is CI run 32558187957 plus a re-run by a session that wrote none of
it, and the close comment cites it that way rather than repeating the claim.

Full local pack green in the same session: `npm test` (26 suites), `test:e2e`,
`test:contracts`, `test:stress`, `test:acceptance:strict`, `test:smoke`.

## 2026-08-20 - The .docx coworker can append, and every #12-#25 gate was mutation-tested

Ticket #17, plus a verification pass over #12-#25. Not closed - closing is the
epic's call, and #22 has a caveat below.

**Append.** `writeDocx` always built a fresh package and `fs.writeFileSync` on top
of whatever was there, so a second coworker action aimed at the same document
destroyed the first one's output. Appending to OOXML is not concatenation, so this
is a zip reader plus a splice:

- `zipRead` parses the **central directory**, not the local file headers. Word sets
  general-purpose bit 3, which leaves zeroes in the local header's CRC and size
  fields and moves the real values into a trailing data descriptor - a reader that
  trusts local headers gets nothing from a real Word document. Every entry's CRC is
  verified on the way in, so appending to an already-damaged package refuses
  instead of preserving the damage and returning `ok: true`.
- `appendDocx` splices before the body-level `<w:sectPr>`, because Word treats
  content after it as malformed. The anchor is deliberately "a sectPr immediately
  before `</w:body>`" rather than "the last sectPr in the string": a paragraph can
  carry its own inside `<w:pPr>`, and the looser anchor would splice new text into
  that paragraph's properties - producing a corrupt document whose old text still
  round-trips, so a text-only assertion would pass while Word refused the file.
- Parts this module never authors - styles, numbering, images, headers - are carried
  through with their **content** byte-for-byte identical. The package is rebuilt, so
  its size on disk may change while no part's content does. Stated narrowly on
  purpose: "byte-for-byte" about a zip is ambiguous, and this is the honest half.
- ZIP64 and encrypted packages refuse by name rather than being half-read. A
  partially understood package is how a part goes missing silently (KB R-0011).

**`word_docx_append` is its own verb, not a `mode` flag on the write.** A plan the
customer approved as "Write a Word document" must not be able to modify a document
they already have. #20 requires the approval text to name the verb, and a mode flag
hides the verb inside the payload where approval never sees it. It is registered in
`plan-guard` (an unsupported verb is refused, so this is the fail-closed direction),
tiered in `safety.js` alongside its siblings, and `plan-describe` renders it as
"Append to the Word document at <path>".

`test/acceptance/verify.test.js` refused the new verb until it earned its exemption
from screenshot verification - the suite already asserted that every observable
driver verb is verifiable. The API-first coworker verbs are exempt because they
change nothing on screen, but the exemption is only honest if they prove themselves
another way, so the artifact-evidence test now also asserts the append digest
describes the bytes on disk *after* the append, and differs from the one before.

**Verification of #12-#25.** Sixteen mutations, each disabling one gate, each
required to turn its suite red (KB R-0007 - verify a gate can fail before trusting
it green). All sixteen were caught. Two things that pass only look like they pass:

- Six of the sixteen were the #17 gates written in this same pass, and two of those
  were **blind on the first run**. The containment test used a path that did not
  exist, so it fell through to `writeDocx` and tested that function's boundary
  rather than `appendDocx`'s - the dangerous case is appending to a file outside the
  root that *already exists*, which never reaches `writeDocx`. And ZIP64 refusal had
  no fixture at all. Both now have tests that fail when the gate is removed.
- The pre-existing `docxText` helper matched `<w:t[^>]*>`, which also matches
  `<w:type w:val="nextPage"/>` - an element real Word documents carry inside their
  section properties. It returned markup as if it were the customer's prose. Fixed
  at the pattern rather than worked around in the fixture.

**#21 is covered, but not where its comment claims.** The transcribe-time guard says
it is "the only line between that stale value and a network upload". It is not:
`transcribe()` calls `probe()` first, and `probe()` re-reads consent and drops a
cached cloud engine before the branch is ever evaluated. Mutating the transcribe
guard leaves the suite green; mutating `probe()`'s check turns two tests red. The
enforcement is real and tested - the comment overstates which line does it.

**#22's caveat.** Its painted-geometry assertion lives only in `test/smoke`, which
`.github/workflows/ci.yml` explicitly declares NOT RUN (Electron needs a desktop
session). That is the right layer to assert at - only rendered geometry can answer
"can the customer see this" - but nothing stops a regression reaching `main`. Either
smoke runs in CI or it is accepted as a pre-merge local gate; it should not stay
unstated.

Also records the founder ruling on `DR-0003`: option C, harvested skills may occupy
the trusted actions slot under governance. The record is amended to say what that
obligates - the authoring path does not exist in Cortex yet, so no Pointer ticket
under it can be written, and `EPIC-P08` lands first.

## 2026-08-07 - The clipboard integrity gate could never fire

Ticket #16. Not closed - needs a different run to verify (R-0003).

`clipboardMatchesSource` and its driver wiring implemented exactly what #11 asked
for, including re-copy-once-then-refuse, and every shipped recipe emitted the
consuming action with no `value` - so `expected` was null and the whole block was
skipped. The gate degraded to "the clipboard is not empty", which stale content
passes trivially.

That matters most in the context the recipe is named for: in a terminal Ctrl+C is
SIGINT, not copy, so the clipboard routinely still holds unrelated earlier
content - and it was written into the .docx with `ok: true`.

The trap was that there is no source text at recipe-definition time; it only
exists after the Ctrl+C whose success is the thing in doubt. So the signal used is
the one that does exist: a new READ-tier `clipboard_baseline` verb records what
was on the clipboard BEFORE the copy, and the consuming step refuses if it is
still there afterwards. The refusal names the length mismatch and the likely
cause. One retry first, matching the explicit-source path.

- `terminal_to_word`, `terminal_to_word_ui` and `claude_to_cursor` all record a
  baseline. `claude_to_cursor` gained a `clipboard_verify` too - pasting whatever
  happened to be on the clipboard into a Cursor chat is the same defect wearing a
  different hat.
- `test/clipboard-integrity.test.js` asserts the acceptance directly: a recipe
  that consumes the clipboard with nothing to compare against fails the suite, and
  a baseline recorded but never read fails it too. The old assertions were
  presence-only (`actions.some(a => a.type === ...)`), which is what let a gate
  that cannot fire report green (KB F-0005).
- Verified the gate fails: with the baselines stripped it names all three
  offending recipes.

Pack: `npm run test:agentic-pack` 435 assertions, `npm run test:smoke` 24.

## 2026-08-07 - Governance gates, CI, and a .docx Word could not open

Tickets #12, #13, #14. Not closed - each needs a different run to verify (R-0003).

- **#12 the routing gate had a false negative.** `claude-contract.test.js` did
  `text.slice(hardIdx)`, which runs to end of file - so it asserted "prd-agent
  appears anywhere at or after the Hard rules heading", not "Hard rules contains
  the invariant". Latent only because Hard rules is currently last. The slice is
  now bounded at the next `##`, and the test carries the decoy case: a mutation
  that deletes the rule from Hard rules while leaving `prd-agent` in a later
  section. Executed both ways - old gate exit 0 (green with the rule deleted),
  bounded gate exit 1. The `None recorded yet` check, keyed to one old stub's
  exact wording, is replaced by a substance check.
- **#12 CI exists** (`.github/workflows/ci.yml`): invariant pack, unit, acceptance,
  e2e, contracts and stress, on windows-latest and ubuntu-latest - `safe-path.js`
  branches per platform, so one runner would leave half the containment logic
  unexercised. The strict acceptance flags are set via `env:` rather than the
  cmd-only `set VAR=` in `test:acceptance:strict`, which would have silently done
  nothing on Linux. A final step names what CI does NOT cover (the smoke lane
  needs a desktop session), because a gap nobody states is a gap nobody sees
  (R-0002).
- **#13 laptop-ASCII is now enforced** (`test/invariants/governed-docs.test.js`)
  across all five governed files, naming file, line, column and what to type
  instead. Nine violations fixed. `CHANGELOG.md` is in scope by decision: its one
  violation was an em dash in a heading, and replacing it preserves the entry's
  meaning exactly, so append-only is not broken - scoping the rule around one
  character would have left the largest governed file unenforced forever. The
  scanner proves itself against a planted violation (R-0007). `docs/ACTIVE.md`
  now tells a cold-start reader that `gh issue list` is the ticket source of truth.
- **#14 `writeDocx` produced documents Word refuses to open.** `xmlEscape` escaped
  `& < > "` but left the control characters XML 1.0 forbids - and terminal output,
  which `terminal_to_word` feeds it, carries ANSI escape sequences whose 0x1B
  introducer is one of them. It returned `ok: true` regardless, because the entire
  correctness assertion on the artifact was that the bytes start with `PK`.
  `stripXmlForbidden` removes exactly the forbidden characters and nothing else,
  so the visible remainder of an ANSI sequence still round-trips. The test now
  unzips the package with stdlib `zlib`, pulls `word/document.xml` back out and
  compares text across a seven-case corpus; `ipc-live.smoke.js` parses it with a
  real `DOMParser` in the booted renderer - the layer the customer receives it at
  (R-0001), and no parser dependency added.
- **#14 dry-run no longer touches disk** - `defaultDocxPath()` used to mkdir before
  the dryRun early return. The production dry-run path (no explicit `path`) had
  never been executed by any test; it is now, and asserts the directory tree is
  byte-for-byte unchanged.

Pack: `npm run test:agentic-pack` 426 assertions, `npm run test:smoke` 24.

## 2026-08-07 - The Open button never worked: IPC bridge completeness

- **`hud:openPath` was blocked at the preload** - `main.js` had the handler and
  `hud.js` made the call, but the channel was never added to the `INVOKE`
  allowlist in `hud-preload.js`, so every click on the status pill's Open button
  was rejected as a blocked channel. Three files have to agree for a HUD button
  to work and nothing checked that they did.
- **Fixed for the class** (R-0004): `test/invariants/ipc-bridge.test.js`
  cross-checks every channel the renderer invokes against both the preload
  allowlist and the `ipcMain.handle` table, in both directions. Verified it fails
  when the entry is removed (R-0007).
- **The Open button now reports refusals** instead of dismissing itself. It used
  to hide the pill unconditionally, so a containment refusal from #19 took the
  only surface that could report it (R-0011).
- **`test/smoke/ipc-live.smoke.js`** drives the real bridge in a booted app: every
  invoked channel survives the allowlist, `hud:openPath` refuses a `.bat` inside a
  sanctioned folder, a `.docx` outside every root, and `C:\Windows\System32\cmd.exe`;
  `hud:sttStatus` answers so hold-to-talk can gate on a real engine; cloud STT
  consent round-trips and defaults to off.
- Teardown: `ipc-live` kills its Electron tree like `hud-boot` does. `main.js` takes
  a single-instance lock, so a surviving tree makes the next launch quit windowless
  and hang the run.

- **The status pill was never driven by a run.** It shipped with an element, CSS
  and a renderer branch for `status` / `act-status`, and nothing in `main.js` ever
  sent one - so an Act run showed no progress at all, and the pill only appeared
  for a finished `.docx`. `executeApproved` now raises it on start, updates it per
  step using the same describer as the approval prompt (#20), and takes it down
  when the run ends. The bridge invariant now covers event types in both
  directions, with the stage window's deliberate drops (DR-0002 - the pointer is
  the identity) asserted as deliberate rather than assumed.

Whole pack green: `npm run test:agentic-pack` 419 assertions, plus `npm run
test:smoke` 23.

## 2026-08-06 - EPIC-P02 boundary, plus the P05/P06 gaps the sweep found

Adversarial sweep tickets #19-#25, implemented. Not closed: each needs a different
run to verify (KB R-0003).

- **Path containment** (`electron/netie/safe-path.js`) - one resolver for the class:
  resolves `..`, symlinks, 8.3 short names, Windows case, UNC and alternate data
  streams before comparing, so `C:\out-evil` no longer passes a prefix test against
  `C:\out`. Used by `word-coworker` (#15, write anywhere) and `hud:openPath` (#19,
  execute anything - `shell.openPath` runs `.exe/.bat/.ps1/.lnk`). Files need an
  extension allowlist and default to refuse; directories under a sanctioned root
  still open, so "Open in Explorer" keeps working (R-0005).
- **Approval disclosure** (`electron/netie/plan-describe.js`, #20) - `5 step(s) - nod
  or approve` is replaced by the verb and destination of every step. Secret values
  are never echoed; a write with no path does not invent one. A `word_*` action
  carrying an explicit destination can no longer resolve to `auto` under any policy.
- **Cloud STT consent** (#21) - `probe()` cached `deepgram-cloud` and short-circuited
  before re-reading consent, so revoking it kept uploading audio for the session.
  Consent is now re-checked on probe and again at the dispatch, and the resolved key
  is dropped on revoke. Proven RED first: the unfixed code uploads to Deepgram.
- **Attachments** (`electron/netie/attachments.js`, #23) - the chip used to be
  decoration; `input.value = ""` destroyed the FileList. Files are now held in
  renderer state keyed to their chip, read, and sent. Text formats inline; 256 KB per
  file, 512 KB total, 5 files; anything else is refused *at the chip* with a reason.
  Attached bytes are data, not commands: fenced, and an intent carrying attachments
  can never auto-run.
- **App recognition** (`electron/netie/app-target.js`, #24) - "put this in Notes" and
  "open it in Excel" matched nothing before. Confirmations now name the app, and an
  app Pointer cannot drive is named and refused instead of silently becoming some
  other plan.
- **Hold-to-talk** (#25) - the control was bound to nothing. The lifecycle lives in
  `hud-live.js`: blur, visibilitychange and pointercancel are hard stops, `end()` is
  idempotent, a watchdog closes a hold whose release never arrives, and a release
  during the engine probe cancels the hold. No engine means it says so rather than
  capturing audio that goes nowhere.
- **Chrome pinned against the rendered HUD** (#22) - `test/smoke/hud-boot.smoke.js`
  now drives the real DOM. Writing it found a defect no source grep could: the LIVE
  bar shipped with `hidden` set and rendered anyway, because `.subtitle-live` carries
  its own `display: flex`. Fixed for the class - `[hidden] { display: none }` - and
  the assertion reads painted geometry, never `el.hidden`.
- Verify lane: the three non-visual coworker verbs are classified as such and now
  assert artifact evidence (sha256 of the bytes on disk) instead of pixels.

## 2026-08-04 - Coworker Word API + Perplexity HUD chrome

- PRD-anchored: Hard rules require `prd-agent` before build; `test/invariants/claude-contract.test.js`.
- Safe Word path: `electron/netie/word-coworker.js`, driver `word_docx_write` / `word_from_clipboard`;
  `terminal_to_word` API-first; UI hotkey fallback + clipboard verify.
- HUD: hide LIVE bar; insights AI|Transcripts flip; status pill; command-bar attach/apps;
  onboard theme unlock; UI refs in `docs/ui-refs/perplexity-computer/`.
- Parked: VM coworker, share-anywhere, TurboOCR/OpenWillow wholesale (`PARKING_LOT.md`).
- Docs: `docs/ACTIVE.md` governance map, `docs/STT_OCR.md`, `docs/skills/word-paste-coworker.md`.
