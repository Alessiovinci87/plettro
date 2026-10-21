"""API di Plettro: carica un brano, segui l'analisi, leggi i consigli.

Avvio:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import os
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .analysis.pipeline import analyze_file
from .jobs import JobStore

logging.basicConfig(level=logging.INFO)

MAX_MB = float(os.environ.get("PLETTRO_MAX_MB", "40"))
ALLOWED = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".webm", ".aiff", ".aif"}

app = FastAPI(title="Plettro API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("PLETTRO_CORS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
jobs = JobStore(workers=int(os.environ.get("PLETTRO_WORKERS", "1")))


@app.get("/health")
def health() -> dict:
    try:
        import demucs  # noqa: F401

        demucs_ok = True
    except ImportError:
        demucs_ok = False
    return {
        "status": "ok",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "demucs": demucs_ok and os.environ.get("PLETTRO_DISABLE_DEMUCS") != "1",
        "presetdock": bool(os.environ.get("PRESETDOCK_URL")),
        "max_mb": MAX_MB,
    }


@app.post("/analyze", status_code=202)
async def analyze(file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(415, f"Formato non supportato ({suffix or 'sconosciuto'}). Usa MP3, WAV, M4A, FLAC o OGG.")
    fd, tmp = tempfile.mkstemp(suffix=suffix, prefix="plettro_")
    size = 0
    with os.fdopen(fd, "wb") as out:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > MAX_MB * 1024 * 1024:
                out.close()
                os.unlink(tmp)
                raise HTTPException(413, f"File troppo grande: il massimo è {MAX_MB:g} MB.")
            out.write(chunk)
    job = jobs.submit(Path(tmp), file.filename or "brano", analyze_file)
    return {"job_id": job.id, "status": job.status}


@app.get("/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Analisi non trovata o scaduta: carica di nuovo il brano.")
    return job.public()
