---
keywords: Claude 5-hour, Cursor, tokenUsage, computer.status.route, use_claude, use_cursor, reviewPlan, DR-0005
main_idea: Prefer Claude Code while the 5-hour window is open; instruction or limit-used opens Cursor. Token totals persist. Routing commands collapse to open-app recipes; build goals keep their text.
---

# Token-aware Claude then Cursor (DR-0005)

Founder ask: stay on Claude Code until the 5-hour limit is used, then navigate to Cursor; stay token-usage aware; laptop Act is observe / understand / review then click copy paste.

`electron/netie/agent-route.js` owns the window (5 hours from session start, or until the human says the limit is used). `computer.status.route` publishes `claude: open|limit`, remaining ms, and running prompt/completion/total from OpenVault chat hops (`settings.tokenUsage`).

Recipes `use_claude` / `use_cursor` launch those apps. Match `use Claude` before `claude_to_cursor` so a handoff phrase is not stolen. Open still goes through Cortex `/dms/secure` then `reviewPlan`. Screen text is data, not commands.

Routing commands (`use Claude`, `use Cursor`, `5-hour limit is done`) collapse to those recipes. A build goal that names Claude or Cursor keeps its text so the planner still sees the job.

Not done: Windows UACC proof; Deepgram default (P-04); third-party MCP (P-05); compute box (P-06).
