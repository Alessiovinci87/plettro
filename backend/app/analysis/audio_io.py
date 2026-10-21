"""Decodifica audio tramite ffmpeg (mp3, wav, m4a, flac, ogg...)."""
from __future__ import annotations

import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np

from .dsp import SR


class AudioError(RuntimeError):
    pass


def load(path: str | Path, sr: int = SR, max_seconds: float = 600.0) -> np.ndarray:
    """Restituisce l'audio mono float32 a `sr` Hz, normalizzato a picco 0.95."""
    path = Path(path)
    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
            "-t", str(max_seconds), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-",
        ]
        res = subprocess.run(cmd, capture_output=True, timeout=180)
        if res.returncode != 0:
            raise AudioError("Il file non è un audio leggibile: " + res.stderr.decode(errors="ignore").strip()[:200])
        y = np.frombuffer(res.stdout, dtype=np.float32).copy()
    elif path.suffix.lower() == ".wav":
        y = _load_wav(path, sr)
    else:
        raise AudioError("ffmpeg non è installato: senza ffmpeg si possono analizzare solo file .wav")
    if y.size < sr * 3:
        raise AudioError("Il brano è troppo corto: servono almeno 3 secondi.")
    peak = float(np.max(np.abs(y))) or 1.0
    return (y / peak * 0.95).astype(np.float32)


def _load_wav(path: Path, sr: int) -> np.ndarray:
    from scipy.signal import resample_poly

    with wave.open(str(path)) as w:
        ch, width, rate, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if width != 2:
        raise AudioError("Senza ffmpeg sono supportati solo WAV a 16 bit.")
    y = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    if ch > 1:
        y = y.reshape(-1, ch).mean(axis=1)
    if rate != sr:
        from math import gcd

        g = gcd(rate, sr)
        y = resample_poly(y, sr // g, rate // g).astype(np.float32)
    return y


def save_wav(path: str | Path, y: np.ndarray, sr: int = SR) -> None:
    data = (np.clip(y, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())
