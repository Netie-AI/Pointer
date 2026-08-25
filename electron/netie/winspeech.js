"use strict";
/**
 * Offline Windows dictation (System.Speech) as a zero-install STT fallback.
 *
 * Same persistent-worker shape as netie/driver.js: PowerShell is started once
 * and fed JSON lines, because the recognizer costs ~1.5 s to construct and
 * per-utterance process spawn would make live transcription unusable. Warm
 * recognition of a ~2 s clip is ~0.8 s.
 *
 * Accuracy is well below Whisper (measured: "open the settings window" →
 * "Although settings window", confidence 0.55), so this sits LAST in the engine
 * chain and reports its confidence so the HUD can mark a rough transcript.
 */

const { spawn } = require("child_process");

const WORKER_PS = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
Add-Type -AssemblyName System.Speech
$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
Write-Output '{"ready":true}'
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim() -eq '') { continue }
  try {
    $msg = $line | ConvertFrom-Json
    if ($msg.op -eq 'exit') { break }
    $rec.SetInputToWaveFile($msg.wav)
    $parts = New-Object System.Collections.ArrayList
    $conf = New-Object System.Collections.ArrayList
    # Recognize() returns one phrase at a time; walk the whole clip. Once the
    # file is exhausted it THROWS ("No audio input is supplied") rather than
    # returning null, so a throw here means end-of-clip, not failure.
    while ($true) {
      $r = $null
      try { $r = $rec.Recognize() } catch { break }
      if ($null -eq $r) { break }
      [void]$parts.Add($r.Text)
      [void]$conf.Add($r.Confidence)
    }
    # Release the wav so the caller can delete it.
    try { $rec.SetInputToNull() } catch {}
    $avg = 0.0
    if ($conf.Count -gt 0) { $avg = ($conf | Measure-Object -Average).Average }
    $out = @{ id = $msg.id; ok = $true; text = ($parts -join ' '); confidence = $avg }
    Write-Output ($out | ConvertTo-Json -Compress)
  } catch {
    $err = @{ id = $msg.id; ok = $false; error = $_.Exception.Message }
    Write-Output ($err | ConvertTo-Json -Compress)
  }
}
$rec.Dispose()
`;

class WinSpeech {
  constructor(opts = {}) {
    this._spawn = opts.spawnImpl || spawn;
    this._worker = null;
    this._pending = new Map();
    this._seq = 0;
    this._buf = "";
    this.ready = false;
  }

  _ensure() {
    if (this._worker) return this._worker;
    // -EncodedCommand (same as driver.js): a multi-line script passed via
    // -Command gets mangled by Windows command-line parsing.
    const encoded = Buffer.from(WORKER_PS, "utf16le").toString("base64");
    const child = this._spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true }
    );
    this._worker = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this._onData(chunk));
    child.on("exit", () => {
      // Fail everything in flight; the next call spawns a fresh worker.
      for (const { reject } of this._pending.values()) {
        reject(new Error("winspeech worker exited"));
      }
      this._pending.clear();
      this._worker = null;
      this.ready = false;
      this._buf = "";
    });
    child.on("error", () => {
      this._worker = null;
      this.ready = false;
    });
    return child;
  }

  _onData(chunk) {
    this._buf += chunk;
    let i;
    while ((i = this._buf.indexOf("\n")) >= 0) {
      const line = this._buf.slice(0, i).trim();
      this._buf = this._buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // PowerShell noise
      }
      if (msg.ready) {
        this.ready = true;
        continue;
      }
      const p = this._pending.get(msg.id);
      if (!p) continue;
      this._pending.delete(msg.id);
      if (msg.ok) p.resolve({ text: String(msg.text || "").trim(), confidence: Number(msg.confidence) || 0 });
      else p.reject(new Error(msg.error || "recognition failed"));
    }
  }

  /** @param {string} wavPath 16 kHz mono PCM wav @returns {Promise<{text,confidence}>} */
  recognizeFile(wavPath) {
    const child = this._ensure();
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error("winspeech timeout"));
      }, 20000);
      this._pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        child.stdin.write(`${JSON.stringify({ id, op: "recognize", wav: wavPath })}\n`);
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  dispose() {
    if (!this._worker) return;
    try {
      this._worker.stdin.write(`${JSON.stringify({ op: "exit" })}\n`);
      this._worker.stdin.end();
    } catch {
      /* already gone */
    }
    this._worker = null;
    this.ready = false;
  }
}

module.exports = { WinSpeech };
