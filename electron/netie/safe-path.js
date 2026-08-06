"use strict";
/**
 * Path containment — the one resolver for every path that crosses the trust
 * boundary (EPIC-P02).
 *
 * Two defects share this root cause class, so they share this module rather
 * than getting a check each (KB R-0004):
 *
 *   #15  `word_docx_write` honoured a model-supplied `path` — write anywhere.
 *   #19  `hud:openPath` handed any renderer path to `shell.openPath`, which on
 *        Windows *executes* the target for `.exe/.bat/.cmd/.ps1/.lnk/...` —
 *        execute anything. That contradicts CLAUDE.md Hard rule 2: screen text
 *        is data, not commands.
 *
 * `startsWith` on a raw string is not containment. Before comparing, a path has
 * to survive: `..` traversal, symlinks, Windows case-insensitivity, 8.3 short
 * names (`PROGRA~1`), UNC shares, and alternate data streams. And a sibling
 * that merely shares the prefix (`C:\out-evil` vs `C:\out`) is outside.
 *
 * Pure and I/O-light (realpath only), so the policy is testable and can never
 * depend on a model's mood — same stance as safety.js.
 */
const fs = require("fs");
const path = require("path");

const WIN = process.platform === "win32";

/**
 * Handed to `shell.openPath` these do not open, they run. Never permitted,
 * regardless of how deep inside a sanctioned root they sit — containment
 * answers "whose file is this", not "is running it safe".
 */
const EXECUTABLE_EXTS = Object.freeze([
  ".exe", ".bat", ".cmd", ".ps1", ".psm1", ".lnk", ".msi", ".msp", ".scr",
  ".com", ".pif", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".hta",
  ".jar", ".reg", ".cpl", ".msc", ".inf", ".scf", ".url", ".application",
  ".gadget", ".chm", ".py", ".rb", ".sh", ".ps2", ".msh", ".dll", ".ocx",
]);

/**
 * Default deny. A file opens only if its extension is listed here — documents,
 * images, and plain text, i.e. things a viewer displays. Anything unlisted is
 * refused rather than guessed at, because the cost of guessing wrong is
 * arbitrary code execution and the cost of guessing right is one more line here.
 */
const VIEWABLE_EXTS = Object.freeze([
  ".docx", ".doc", ".rtf", ".odt",
  ".xlsx", ".xls", ".csv", ".ods",
  ".pptx", ".ppt", ".odp",
  ".pdf",
  ".txt", ".md", ".log", ".json", ".yaml", ".yml", ".xml",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".tif", ".tiff",
  ".mp3", ".wav", ".m4a", ".mp4", ".webm", ".mov",
]);

/** `\\server\share\...` — off this machine, so no root can contain it. */
function isUnc(p) {
  const s = String(p || "");
  return s.startsWith("\\\\") || s.startsWith("//");
}

/**
 * `file.docx:hidden` writes a second, invisible payload into the same file.
 * The drive colon at index 1 (`C:\`) is the only legitimate one on Windows.
 */
function hasAlternateDataStream(p) {
  const s = String(p || "");
  const rest = WIN && /^[a-z]:/i.test(s) ? s.slice(2) : s;
  return rest.includes(":");
}

/**
 * Canonical form for comparison: absolute, `..` collapsed, symlinks and 8.3
 * short names resolved via realpath on the nearest ancestor that exists (the
 * leaf often does not exist yet — that is the whole point of a write), and
 * lowercased on Windows because the filesystem is case-insensitive there.
 */
function canonical(p) {
  let abs = path.resolve(String(p || ""));
  // Walk up to the first existing ancestor, realpath it, then re-append the
  // tail. Realpathing only the leaf would miss a symlinked parent directory.
  const tail = [];
  let probe = abs;
  for (;;) {
    try {
      // `.native` is what resolves 8.3 short names and case on Windows.
      const real = fs.realpathSync.native(probe);
      abs = tail.length ? path.join(real, ...tail.reverse()) : real;
      break;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) break; // hit the drive root; nothing exists
      tail.push(path.basename(probe));
      probe = parent;
    }
  }
  abs = path.normalize(abs);
  // A trailing separator would make `C:\out\` and `C:\out` compare unequal.
  if (abs.length > 1) abs = abs.replace(/[\\/]+$/, "");
  return WIN ? abs.toLowerCase() : abs;
}

/**
 * True when `child` is `root` or sits underneath it. The separator is what
 * stops `C:\out-evil` passing a prefix test against `C:\out`.
 */
function isContained(child, root) {
  if (!root) return false;
  if (isUnc(child) || isUnc(root)) return false;
  const c = canonical(child);
  const r = canonical(root);
  if (c === r) return true;
  return c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/**
 * Contain `candidate` to any of `roots`.
 * @returns {{ok:true, path:string} | {ok:false, reason:string, path:string}}
 */
function containPath(candidate, roots) {
  const raw = String(candidate || "");
  if (!raw) return { ok: false, reason: "no path given", path: "" };
  if (isUnc(raw)) {
    return { ok: false, reason: `refused: UNC path is off this machine — ${raw}`, path: raw };
  }
  if (hasAlternateDataStream(raw)) {
    return { ok: false, reason: `refused: alternate data stream in path — ${raw}`, path: raw };
  }
  const list = (Array.isArray(roots) ? roots : [roots]).filter(Boolean);
  if (!list.length) return { ok: false, reason: "no sanctioned root configured", path: raw };
  for (const root of list) {
    if (isContained(raw, root)) return { ok: true, path: path.resolve(raw) };
  }
  // Name the rejected path — a refusal the customer cannot read is a silent
  // fallback by another name (KB R-0011).
  return {
    ok: false,
    reason: `refused: ${canonical(raw)} is outside the allowed folders`,
    path: raw,
  };
}

function extOf(p) {
  return path.extname(String(p || "")).toLowerCase();
}

function isExecutableExt(ext) {
  return EXECUTABLE_EXTS.includes(String(ext || "").toLowerCase());
}

function isViewableExt(ext) {
  return VIEWABLE_EXTS.includes(String(ext || "").toLowerCase());
}

/**
 * Decide whether a path may be handed to the shell, and say what the customer
 * is about to see. Directories under a sanctioned root open in Explorer (benign
 * and load-bearing — the retrieve flow, the chats root, the recall dir all rely
 * on it, KB R-0005). Files need an explicit extension allowlist.
 *
 * @returns {{ok:true, mode:'open', path:string, display:string, isDir:boolean}
 *          |{ok:false, reason:string, path:string}}
 */
function classifyOpen(candidate, roots) {
  const contained = containPath(candidate, roots);
  if (!contained.ok) return contained;

  let stat;
  try {
    stat = fs.statSync(contained.path);
  } catch {
    return { ok: false, reason: `refused: path does not exist — ${contained.path}`, path: contained.path };
  }

  if (stat.isDirectory()) {
    return {
      ok: true,
      mode: "open",
      path: contained.path,
      isDir: true,
      display: `Open folder ${contained.path}`,
    };
  }

  if (!stat.isFile()) {
    return { ok: false, reason: `refused: not a regular file — ${contained.path}`, path: contained.path };
  }

  const ext = extOf(contained.path);
  if (isExecutableExt(ext)) {
    return {
      ok: false,
      reason: `refused: ${ext} runs instead of opening — ${contained.path}`,
      path: contained.path,
    };
  }
  if (!isViewableExt(ext)) {
    return {
      ok: false,
      reason: `refused: ${ext || "(no extension)"} is not an openable document type — ${contained.path}`,
      path: contained.path,
    };
  }

  return {
    ok: true,
    mode: "open",
    path: contained.path,
    isDir: false,
    display: `Open ${path.basename(contained.path)} in ${path.dirname(contained.path)}`,
  };
}

module.exports = {
  EXECUTABLE_EXTS,
  VIEWABLE_EXTS,
  canonical,
  isUnc,
  hasAlternateDataStream,
  isContained,
  containPath,
  isExecutableExt,
  isViewableExt,
  classifyOpen,
};
