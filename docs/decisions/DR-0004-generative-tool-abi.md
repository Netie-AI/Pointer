---
status: proposed
date: 2026-08-25
decision-makers: founder
---

# DR-0004 - Generative tools via search, not a skill dump

## Context and Problem Statement

Founder request (2026-08-25): stop enumerating skills for every scenario.
Look up tools the way Grok Bot's host/coordinator does (MCP as the ABI),
keep skills in Cortex / OpenVault, craft a stub when the catalog misses,
run on the local laptop first, and host a live coordinator so Cursor Cloud
agents and Cortex agents do not collide. Compute fallback (Cloudflare box,
old MacBook, VPS) only if the laptop cannot host the runner.

This is a PRD amendment. It does not reopen EPIC-P04/P07. It does not
unlock P-05 (arbitrary MCP servers / coworker verbs on the loopback
marketplace). Harvested skills still cannot fill `hit.actions` (DR-0003).

## Decision Outcome

1. **Search, then craft a hint.** Act always asks Cortex
   `/api/discovery/find-skills` plus the local recipe index. A miss writes
   a draft SkillCard in the untrusted hint tier (DR-0003 option B). Drafts
   never carry executable `actions`. Stronger models may write the hint
   text later; they may not promote the draft.
2. **First-party MCP ABI.** JSON-RPC tools
   `skills.search`, `skills.craft`, `lanes.claim`, `lanes.release`,
   `lanes.list`, `tools.list`. Unknown methods refuse. No third-party MCP
   load.
3. **Live coordinator, local-first.** Loopback HTTP (default
   `127.0.0.1:18010`) serves `/`, `/today`, `/lanes`, `/skills`. Public
   `host.netie.ai` is the same pages behind a later tunnel/Worker. Lanes
   `pointer-act`, `cursor-cloud`, `cortex`, `craft` claim/release so two
   agents cannot own the same Act surface.
4. **Compute box stays parked (P-06).** Cloudflare / MacBook / VPS is a
   sandbox host, not a skill dump. Unlock: local laptop cannot run the
   coordinator or a sandboxed tool twice in a real session, and the founder
   picks the host.

## Confirmation

`test/coordinator.test.js`, `test/mcp-abi.test.js`, and `test/host-serve.test.js`
(public Worker shell; `/mcp` stays 404 off loopback).
