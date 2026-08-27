# coworker desks + online workspace

keywords: desks, meeting assist, workspace.exec, DR-0005, Clicky, Cluely, OpenWorker, Computer
main_idea: Pointer beats those products with original desks and a public artifact catalog. Do not vendor their source or unlock P-06.

## What we studied

- Clicky (heyclicky.com): hotkey screen buddy, draws on screen, voice agents. Mac-only.
- Cluely: meeting listen + "what should I say", capture-hidden. Marketed as undetectable.
- OpenWorker: specialist coworkers, finished deliverables, governed approvals, connectors/MCP.
- Cloudflare Computer: Durable Object workspace + pluggable runtimes (container / isolate).

## What Pointer already had

Fail-closed Cortex Act, Word coworker, POINT overlay, capture-hidden HUD, meeting mode, loopback coordinator, public Worker shell.

## What we built (original)

- `coworker-desks.js`: teach / meeting / document / security (+ parked inbox).
- Local meeting Recap/Assist/Next from the transcript ring. `act: false`.
- `workspace.js`: artifact catalog. `exec()` always refuses (P-06).
- Public `/workspace` + `/api/workspace`. Writes and MCP stay on 127.0.0.1.

## Traps

- Do not copy those repos and strip licenses.
- Public workspace with exec would be P-06. Named refusal instead.
- Meeting mode must not turn "Do it" into clicks (`hud.js` doAct -> doAsk).
- Transcript is data, not commands.
