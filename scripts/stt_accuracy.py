#!/usr/bin/env python3
"""
Netie Clicks — rojak STT accuracy harness.

Reads a phrase list aloud with you, records each one, sends it to the local
sidecar, and writes a markdown scorecard you can mark up. Built for Malaysian /
Singaporean speech: English, Chinese, Malay, and code-switched ("rojak") lines
are scored SEPARATELY, because an overall average hides the exact thing we care
about — whether mixing languages mid-sentence breaks the model.

Usage:
  py -3.12 scripts/stt_accuracy.py                 # full set
  py -3.12 scripts/stt_accuracy.py --only rojak    # one category
  py -3.12 scripts/stt_accuracy.py --seconds 6     # longer window per phrase

Needs: ffmpeg on PATH, sidecar on :8766 (npm run stt).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path

# The Windows console defaults to cp1252, which cannot encode Chinese — without
# this, printing any zh/rojak phrase raises UnicodeEncodeError mid-test.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

SIDECAR = os.environ.get("NETIE_STT_URL", "http://127.0.0.1:8766")
MIC = os.environ.get("NETIE_MIC_DEVICE", "Microphone Array (AMD Audio Device)")

# Categories are kept apart on purpose: a single blended score would let strong
# English performance mask a total failure on code-switching.
PHRASES: list[tuple[str, str]] = [
    ("en", "Open the settings window"),
    ("en", "Scroll down and click the blue button"),
    ("en", "What is on my screen right now"),
    ("zh", "帮我打开设置"),
    ("zh", "这个文件在哪里"),
    ("ms", "Tolong buka fail itu"),
    ("ms", "Saya nak hantar mesej ini"),
    ("rojak", "帮我 copy 这段到 Cursor"),
    ("rojak", "Jom meeting, I share screen dulu"),
    ("rojak", "这个 button 你 click 一下 lah"),
    ("rojak", "Can you tolong check 一下 the error message"),
    ("cmd", "Transcribe mode"),
    ("cmd", "Meeting mode"),
    ("cmd", "Copy the last message from Claude to Cursor"),
]


def record(path: str, seconds: int) -> bool:
    """Record mono 16 kHz from the default mic via ffmpeg/dshow."""
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "dshow", "-i", f"audio={MIC}",
        "-t", str(seconds), "-ac", "1", "-ar", "16000",
        path,
    ]
    return subprocess.run(cmd, capture_output=True).returncode == 0


def transcribe(path: str, language: str | None = None) -> dict:
    """POST the wav to the sidecar as multipart/form-data (stdlib only)."""
    boundary = "----netie" + str(int(time.time() * 1000))
    with open(path, "rb") as fh:
        audio = fh.read()
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"audio.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode(),
        audio,
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-1\r\n".encode(),
    ]
    if language:
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n{language}\r\n".encode()
        )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(
        f"{SIDECAR}/v1/audio/transcriptions",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    started = time.time()
    with urllib.request.urlopen(req, timeout=180) as res:
        data = json.loads(res.read().decode("utf-8"))
    data["_ms"] = int((time.time() - started) * 1000)
    return data


def norm(s: str) -> str:
    """Casefold + strip punctuation so scoring judges words, not commas."""
    s = unicodedata.normalize("NFKC", s or "").casefold()
    return "".join(ch for ch in s if ch.isalnum() or ch.isspace()).strip()


def tokens(s: str) -> list[str]:
    """CJK has no spaces — treat each Han char as its own token."""
    out: list[str] = []
    for word in norm(s).split():
        buf = ""
        for ch in word:
            if unicodedata.east_asian_width(ch) in ("W", "F"):
                if buf:
                    out.append(buf)
                    buf = ""
                out.append(ch)
            else:
                buf += ch
        if buf:
            out.append(buf)
    return out


def edit_distance(a: list[str], b: list[str]) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def error_rate(ref: str, hyp: str) -> float:
    r, h = tokens(ref), tokens(hyp)
    if not r:
        return 0.0
    return edit_distance(r, h) / len(r)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, default=5)
    ap.add_argument("--only", default="", help="en|zh|ms|rojak|cmd")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    try:
        with urllib.request.urlopen(f"{SIDECAR}/health", timeout=5) as r:
            health = json.loads(r.read().decode())
        if not health.get("model_loaded"):
            print("Model still loading — wait for /health model_loaded:true, then rerun.")
            return 2
        print(f"Sidecar ready: model={health.get('model')} device={health.get('device')}\n")
    except Exception as exc:  # noqa: BLE001
        print(f"No sidecar at {SIDECAR} ({exc}). Start it with:  npm run stt")
        return 2

    picked = [p for p in PHRASES if not args.only or p[0] == args.only]
    print(f"{len(picked)} phrases. Speak each ONE clearly after the beep-line.")
    print(f"You get {args.seconds}s per phrase. Ctrl+C to stop.\n")

    rows = []
    tmpdir = tempfile.mkdtemp(prefix="netie-stt-acc-")
    for i, (cat, phrase) in enumerate(picked, 1):
        print(f"[{i}/{len(picked)}] ({cat})  SAY:  {phrase}")
        input("      press Enter, then speak… ")
        wav = str(Path(tmpdir) / f"{i}.wav")
        if not record(wav, args.seconds):
            print("      ffmpeg record failed — check NETIE_MIC_DEVICE\n")
            continue
        try:
            res = transcribe(wav)
        except Exception as exc:  # noqa: BLE001
            print(f"      transcribe failed: {exc}\n")
            continue
        heard = (res.get("text") or "").strip()
        er = error_rate(phrase, heard)
        rows.append(
            {
                "cat": cat, "said": phrase, "heard": heard,
                "err": er, "lang": res.get("language"), "ms": res.get("_ms"),
            }
        )
        mark = "OK  " if er == 0 else ("near" if er <= 0.34 else "MISS")
        print(f"      heard: {heard}")
        print(f"      {mark}  err={er:.0%}  lang={res.get('language')}  {res.get('_ms')}ms\n")

    if not rows:
        print("No results.")
        return 1

    by_cat: dict[str, list[float]] = {}
    for r in rows:
        by_cat.setdefault(r["cat"], []).append(r["err"])

    print("\n=== Accuracy by category (lower is better) ===")
    for cat, errs in sorted(by_cat.items()):
        avg = sum(errs) / len(errs)
        exact = sum(1 for e in errs if e == 0)
        print(f"  {cat:6s}  err={avg:5.0%}   exact={exact}/{len(errs)}")

    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    out = args.out or str(Path("docs") / f"STT_ACCURACY_{stamp}.md")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(f"# STT accuracy — {stamp}\n\n")
        fh.write(f"Model `{health.get('model')}` on `{health.get('device')}`.\n\n")
        fh.write("Mark the **Verdict** column yourself: `right` / `wrong` / `close`.\n")
        fh.write("Tell Claude which are wrong and we tune from there.\n\n")
        fh.write("| # | Cat | Said | Heard | Err | Lang | ms | Verdict |\n")
        fh.write("|---|-----|------|-------|-----|------|----|---------|\n")
        for i, r in enumerate(rows, 1):
            said = r["said"].replace("|", "\\|")
            heard = (r["heard"] or "_(nothing)_").replace("|", "\\|")
            fh.write(
                f"| {i} | {r['cat']} | {said} | {heard} | {r['err']:.0%} | "
                f"{r['lang']} | {r['ms']} | |\n"
            )
        fh.write("\n## Summary\n\n| Cat | Avg err | Exact |\n|-----|---------|-------|\n")
        for cat, errs in sorted(by_cat.items()):
            fh.write(f"| {cat} | {sum(errs)/len(errs):.0%} | {sum(1 for e in errs if e==0)}/{len(errs)} |\n")
    print(f"\nScorecard written: {out}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nstopped")
        sys.exit(130)
