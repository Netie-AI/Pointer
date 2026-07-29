"use strict";
/**
 * Safe-ish Python check runner for coding answers.
 * Writes a temp .py, runs with timeout, returns stdout/stderr.
 * Never installs packages; never touches network from our side.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const FENCE = /```(?:python|py)\s*\n([\s\S]*?)```/gi;

function extractPythonBlocks(markdown) {
  const out = [];
  const text = String(markdown || "");
  let m;
  const re = new RegExp(FENCE.source, "gi");
  while ((m = re.exec(text))) {
    const code = (m[1] || "").trim();
    if (code) out.push(code);
  }
  return out;
}

function runPython(code, opts = {}) {
  const timeoutMs = opts.timeoutMs || 12000;
  const root = opts.tempDir || path.join(os.tmpdir(), "netie-clicks", "pycheck");
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, `check-${Date.now()}-${process.pid}.py`);
  fs.writeFileSync(file, String(code || ""), "utf8");
  const py = opts.python || "py";
  const args = opts.pythonArgs || ["-3.12", file];

  return new Promise((resolve) => {
    execFile(
      py,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 512 },
      (err, stdout, stderr) => {
        try {
          fs.unlinkSync(file);
        } catch {
          /* ok */
        }
        if (err && err.killed) {
          resolve({ ok: false, timedOut: true, stdout: String(stdout || ""), stderr: "timed out" });
          return;
        }
        resolve({
          ok: !err,
          code: err && typeof err.code === "number" ? err.code : 0,
          stdout: String(stdout || "").slice(0, 8000),
          stderr: String(stderr || (err && err.message) || "").slice(0, 4000),
          file,
        });
      }
    );
  });
}

async function checkMarkdownPython(markdown, opts = {}) {
  const blocks = extractPythonBlocks(markdown);
  if (!blocks.length) return { ok: true, ran: 0, results: [] };
  const results = [];
  for (const code of blocks.slice(0, opts.maxBlocks || 3)) {
    results.push({ code: code.slice(0, 2000), ...(await runPython(code, opts)) });
  }
  return {
    ok: results.every((r) => r.ok),
    ran: results.length,
    results,
  };
}

module.exports = { extractPythonBlocks, runPython, checkMarkdownPython };
