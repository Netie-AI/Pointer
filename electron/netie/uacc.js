"use strict";
/**
 * UACC (Universal AI Computer Control) skill catalog + install probe.
 *
 * Pointer does not spawn UACC as an ungoverned third-party MCP server
 * (DR-0004 / DR-0005). It ships the READ skill names so search hits them,
 * probes `pip install uacc`, and leaves click/type on the existing Act path.
 */

const { spawnSync } = require("child_process");

/** READ / observe skills that match UACC MCP tool names. */
const UACC_SKILLS = Object.freeze([
  { id: "uacc_planner", title: "UACC planner", risk: "read" },
  { id: "uacc_screen_info", title: "UACC screen info", risk: "read", uacc: "get_screen_info" },
  { id: "uacc_screen_info_enhanced", title: "UACC enhanced screen info", risk: "read", uacc: "get_screen_info_enhanced" },
  { id: "uacc_screenshot", title: "UACC screenshot", risk: "read", uacc: "screenshot" },
  { id: "uacc_list_monitors", title: "UACC list monitors", risk: "read", uacc: "list_monitors" },
  { id: "uacc_find_element", title: "UACC find element", risk: "read", uacc: "find_element" },
  { id: "uacc_where_is", title: "UACC where is", risk: "read", uacc: "uacc_where_is" },
  { id: "uacc_query", title: "UACC query", risk: "read", uacc: "uacc_query" },
  { id: "uacc_list_windows", title: "UACC list windows", risk: "read", uacc: "list_windows" },
  { id: "uacc_active_window", title: "UACC active window", risk: "read", uacc: "get_active_window" },
  { id: "uacc_mouse_position", title: "UACC mouse position", risk: "read", uacc: "get_mouse_position" },
  { id: "uacc_wait_for_element", title: "UACC wait for element", risk: "read", uacc: "wait_for_element" },
  { id: "uacc_clipboard_read", title: "UACC clipboard read", risk: "read", uacc: "clipboard_read" },
  { id: "uacc_smart_click", title: "UACC smart click", risk: "write", uacc: "smart_click" },
  { id: "uacc_smart_type", title: "UACC smart type", risk: "write", uacc: "smart_type" },
]);

const READ_IDS = new Set(UACC_SKILLS.filter((s) => s.risk === "read").map((s) => s.id));

const SEARCH_TOKENS = Object.freeze([
  "uacc",
  "screeninfo",
  "screenshot",
  "accessibility",
  "a11y",
  "textmap",
  "find element",
  "where is",
  "list windows",
  "list monitors",
  "active window",
  "smart click",
  "smart type",
  "computer control",
  "desktop agent",
]);

function tokensOf(goal) {
  return String(goal || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchUaccSkills(goal) {
  const text = tokensOf(goal);
  if (!text) return [];
  const compact = text.replace(/\s+/g, "");
  const matched = SEARCH_TOKENS.some((t) => text.includes(t) || compact.includes(t.replace(/\s+/g, "")));
  if (!matched) return [];
  const want = text.split(" ").filter((w) => w.length > 2);
  const ranked = UACC_SKILLS.filter((s) => {
    const hay = `${s.id} ${s.title} ${s.uacc || ""}`.toLowerCase();
    return want.some((w) => hay.includes(w)) || text.includes("uacc");
  });
  const hits = (ranked.length ? ranked : UACC_SKILLS.slice(0, 5)).slice(0, 8).map((s) => ({
    id: s.id,
    title: s.title,
    source: "uacc-skill",
    uacc: s.uacc || s.id,
    risk: s.risk,
    actions: [],
  }));
  return hits;
}

function parseProbe(stdout, stderr, status) {
  const out = String(stdout || "") + String(stderr || "");
  if (status === 0 && /uacc/i.test(out)) {
    const ver = (out.match(/uacc[^\d]*(\d+\.\d+\.\d+)/i) || [])[1] || "installed";
    return { installed: true, version: ver };
  }
  if (/No module named ['"]uacc['"]/i.test(out) || status !== 0) {
    return { installed: false, reason: "not-installed" };
  }
  return { installed: false, reason: "not-installed" };
}

/**
 * Probe `python -m uacc` / `import uacc`. Cheap, sync, cacheable.
 * @param {{ env?: NodeJS.ProcessEnv, run?: Function, refresh?: boolean }} [opts]
 */
let cached = null;
function detectUacc(opts = {}) {
  const env = opts.env || process.env;
  if (env.NETIE_UACC === "0") return { installed: false, reason: "disabled" };
  if (cached && !opts.refresh && !opts.run) return cached;
  const run =
    opts.run ||
    ((cmd, args) => {
      try {
        return spawnSync(cmd, args, { encoding: "utf8", timeout: 4000, windowsHide: true });
      } catch (err) {
        return { status: 1, stdout: "", stderr: String(err && err.message ? err.message : err) };
      }
    });
  const py = process.platform === "win32" ? "python" : "python3";
  const attempts = [
    [py, ["-c", "import uacc; print('uacc', getattr(uacc,'__version__','ok'))"]],
    [py, ["-m", "uacc", "--help"]],
    ["uacc-mcp", ["--help"]],
  ];
  let last = { installed: false, reason: "not-installed" };
  for (const [cmd, args] of attempts) {
    const res = run(cmd, args) || {};
    last = parseProbe(res.stdout, res.stderr, res.status);
    if (last.installed) {
      last.command = cmd;
      break;
    }
  }
  if (!opts.run) cached = last;
  return last;
}

function computerStatus(opts = {}) {
  const captureVisible = opts.captureVisible === true;
  const uacc = opts.uacc || detectUacc(opts);
  return {
    ok: true,
    detectable: captureVisible,
    captureVisible,
    bind: "127.0.0.1",
    mcp: "/mcp",
    api: "/api/computer",
    uacc: {
      installed: Boolean(uacc && uacc.installed),
      version: (uacc && uacc.version) || null,
      reason: (uacc && uacc.reason) || null,
      skills: UACC_SKILLS.map((s) => s.id),
    },
    act: {
      available: false,
      reason: "no Cortex /dms/secure gate",
    },
  };
}

function computerObserve(opts = {}) {
  const status = computerStatus(opts);
  return {
    ok: true,
    detectable: status.detectable,
    captureVisible: status.captureVisible,
    source: status.uacc.installed ? "uacc" : "pointer",
    elements: Array.isArray(opts.elements) ? opts.elements : [],
    note: status.detectable
      ? "HUD is visible to screen capture"
      : "HUD is content-protected; turn on captureVisible or NETIE_CAPTURE_VISIBLE=1",
  };
}

module.exports = {
  UACC_SKILLS,
  READ_IDS,
  searchUaccSkills,
  detectUacc,
  parseProbe,
  computerStatus,
  computerObserve,
};
