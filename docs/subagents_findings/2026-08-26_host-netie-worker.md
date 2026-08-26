---
keywords: host.netie.ai, Worker, localFirst, MCP loopback, DR-0004
main_idea: Public Worker serves the same pages; /mcp and live lanes stay on 127.0.0.1; P-06 still parked
---

# Public host.netie.ai Worker shell

Continuation of DR-0004. Not the compute box (P-06). Not P-05.
`workers/netie-host.js` + `electron/netie/host-serve.js`.
Public `/api/state` is localFirst with empty lanes. `/mcp` is 404.
Loopback coordinator still serves live state on :18010.
