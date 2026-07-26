#!/usr/bin/env python3
"""
Netie Clicks STT sidecar — faster-whisper, Malaysian rojak ready (zh/en/ms mix).

Endpoints (OpenAI-shaped + health):
  GET  /health
  GET  /v1/models
  POST /v1/audio/transcriptions   multipart file=audio.wav

Env:
  NETIE_STT_MODEL   default small (multilingual — NOT *.en)
  NETIE_STT_DEVICE  cpu|cuda  default cpu
  NETIE_STT_PORT    default 8766
"""

from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
import uvicorn

MODEL_NAME = os.environ.get("NETIE_STT_MODEL", "small")
DEVICE = os.environ.get("NETIE_STT_DEVICE", "cpu")
COMPUTE = os.environ.get("NETIE_STT_COMPUTE", "int8" if DEVICE == "cpu" else "float16")
PORT = int(os.environ.get("NETIE_STT_PORT", "8766"))

app = FastAPI(title="Netie STT", version="1.0")
_model = None
# Startup warmup and the first request can race; without this both would
# construct a WhisperModel and hold two copies of the weights in RAM.
_model_lock = threading.Lock()


def get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel

                _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE)
    return _model


@app.on_event("startup")
def _preload() -> None:
    """
    Load weights before serving. Otherwise the first transcription pays the
    download+load cost inside the request, which blows past the client timeout
    and makes Netie demote the sidecar on its very first use.
    """
    import threading

    def _load():
        try:
            get_model()
            print(f"[netie-stt] model ready: {MODEL_NAME} ({DEVICE}/{COMPUTE})", flush=True)
        except Exception as exc:  # noqa: BLE001 - report, don't crash the server
            print(f"[netie-stt] model load FAILED: {exc}", flush=True)

    threading.Thread(target=_load, daemon=True).start()


@app.get("/health")
def health():
    return {
        "ok": True,
        "product": "netie-clicks-stt",
        "model": MODEL_NAME,
        "device": DEVICE,
        # Netie's probe uses this to avoid selecting an engine that cannot
        # answer yet (weights still downloading on a cold first run).
        "model_loaded": _model is not None,
        "rojak": True,
        "languages": ["zh", "en", "ms", "auto"],
    }


@app.get("/v1/models")
def models():
    return {"data": [{"id": MODEL_NAME, "object": "model"}]}


@app.post("/v1/audio/transcriptions")
def transcribe(
    file: UploadFile = File(...),
    model: str = Form(None),
    language: str = Form(None),
):
    """
    Sync handler so Whisper load/inference runs in uvicorn's threadpool
    and does not freeze /health on the event loop.
    Multilingual + code-switch friendly:
      language=None → auto
      multilingual=True → re-detect across segments (zh/en/ms rojak)
      condition_on_previous_text=False → don't lock onto wrong language
    """
    raw = file.file.read()
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(raw)
        path = tmp.name

    try:
        m = get_model()
        lang = (language or "").strip() or None
        if lang in ("auto", "mixed", "rojak"):
            lang = None
        segments, info = m.transcribe(
            path,
            language=lang,
            multilingual=True,
            condition_on_previous_text=False,
            vad_filter=True,
            beam_size=5,
        )
        parts = []
        for seg in segments:
            t = (seg.text or "").strip()
            if t:
                parts.append(t)
        text = " ".join(parts).strip()
        return {
            "text": text,
            "language": getattr(info, "language", None),
            "language_probability": getattr(info, "language_probability", None),
            "model": MODEL_NAME,
        }
    except Exception as e:
        return JSONResponse({"error": str(e), "text": ""}, status_code=500)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _warmup():
    try:
        get_model()
        print("[netie-stt] model warm")
    except Exception as e:
        print("[netie-stt] warmup failed:", e)


if __name__ == "__main__":
    import threading

    print(f"[netie-stt] model={MODEL_NAME} device={DEVICE} port={PORT}")
    print("[netie-stt] first load may download weights — /health stays responsive")
    threading.Thread(target=_warmup, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
