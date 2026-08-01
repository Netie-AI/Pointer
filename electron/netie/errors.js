"use strict";
/**
 * Turn upstream failure text into something a human can act on.
 *
 * A provider chain that exhausts itself produces text like:
 *
 *   "request rejected by upstream, non-retryable, type: openvault_non_retryable,
 *    reason: non_retryable, details: all connection attempts failed; litellm
 *    proxy seeded; all connections attempted failed; openrouter api key failed"
 *
 * Six restatements of one fact — *nobody gave OpenVault a key* — and none of them
 * say which file to edit. Dumping that into the answer pane is the same failure as
 * a silent fallback (R-0011): the degradation is technically visible and
 * practically useless.
 *
 * This maps the noise to one sentence plus the fix. The raw text is never
 * discarded — callers keep it for the console and the ledger — but it is not what
 * the user reads.
 *
 * Pure and network-free.
 */

/** Longest raw error we will ever surface verbatim when nothing matches. */
const MAX_RAW = 160;

/**
 * Ordered: first match wins, so put the specific causes above the generic ones.
 * `hint` is the action to take, and it names a path wherever one exists —
 * "configure your provider" is not a fix, "edit this file" is.
 */
const PATTERNS = Object.freeze([
  {
    re: /(api[_ -]?key|no key|missing key|unauthorized|401|invalid[_ -]?api[_ -]?key)/i,
    title: "No model key in OpenVault",
    hint: "Add GEMINI_API_KEY to D:\\OpenVault\\.env.local and restart OpenVault. Pointer never holds keys.",
    kind: "no-key",
  },
  {
    re: /(all connection attempts failed|econnrefused|connect(ion)? refused|fetch failed|network error|enotfound)/i,
    title: "OpenVault is not answering",
    hint: "Start OpenVault on 127.0.0.1:5000, then try again.",
    kind: "openvault-down",
  },
  {
    re: /cortex[- ]unavailable/i,
    title: "Cortex security gate is offline",
    hint: "Start Cortex on 127.0.0.1:8010. Actions stay paused until it answers — questions still work.",
    kind: "cortex-down",
  },
  {
    re: /(rate[_ -]?limit|429|quota|resource[_ -]?exhausted)/i,
    title: "Model is rate-limited",
    hint: "Wait a moment, or let OpenVault fall through to a backup provider.",
    kind: "rate-limit",
  },
  {
    re: /(timed? ?out|timeout|abort)/i,
    title: "The model took too long",
    hint: "The request was cancelled. A smaller model in OpenVault's provider order will feel faster.",
    kind: "timeout",
  },
  {
    re: /(blocked by the netie security gate|prompt[_ -]?injection|scam)/i,
    title: "Blocked by the security gate",
    hint: "Something on screen looked like an instruction aimed at me. Nothing ran.",
    kind: "blocked",
  },
]);

/**
 * @param {unknown} raw
 * @returns {{title:string, hint:string, kind:string, raw:string, text:string}}
 */
function humanizeError(raw) {
  const text = String(
    raw && typeof raw === "object" ? raw.message || raw.error || JSON.stringify(raw) : raw || ""
  ).trim();

  if (!text) {
    return { title: "Something went wrong", hint: "", kind: "unknown", raw: "", text: "Something went wrong" };
  }

  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      return { title: p.title, hint: p.hint, kind: p.kind, raw: text, text: `${p.title} — ${p.hint}` };
    }
  }

  // Unmatched: show a bounded single line rather than a wall of proxy chatter.
  const oneLine = text.replace(/\s+/g, " ").trim();
  const clipped = oneLine.length > MAX_RAW ? `${oneLine.slice(0, MAX_RAW - 1)}…` : oneLine;
  return { title: clipped, hint: "", kind: "unknown", raw: text, text: clipped };
}

/** Short form for the status chip, which has about forty characters of room. */
function shortError(raw) {
  const { title } = humanizeError(raw);
  return title.length > 44 ? `${title.slice(0, 43)}…` : title;
}

module.exports = { humanizeError, shortError, PATTERNS, MAX_RAW };
