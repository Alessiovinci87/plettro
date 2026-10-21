"""Melodia principale (indicativa) e posizione suggerita sul manico.

Salienza per somma di armoniche su semitoni (MIDI 40-88), voce più forte per
frame, filtro mediano, segmentazione in note. Con Basic Pitch installato
(pip install basic-pitch) si usa quello sulla traccia chitarra, più preciso.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .dsp import Spec

STANDARD = [40, 45, 50, 55, 59, 64]


def salience_track(spec: Spec, lo: int = 40, hi: int = 88, harmonics: int = 5) -> tuple[np.ndarray, np.ndarray]:
    f = spec.freqs
    logm = np.log1p(spec.mag * 20)
    midis = np.arange(lo, hi + 1)
    sal = np.zeros((len(midis), logm.shape[1]), dtype=np.float32)
    for i, m in enumerate(midis):
        f0 = 440 * 2 ** ((m - 69) / 12)
        for h in range(1, harmonics + 1):
            fh = f0 * h
            if fh > f[-1]:
                break
            j = int(round(fh / (f[1] - f[0])))
            sal[i] += (0.8 ** (h - 1)) * logm[max(0, j - 1) : j + 2].max(axis=0)
    best = sal.argmax(axis=0)
    peak = sal.max(axis=0)
    voiced = peak > np.percentile(peak, 55)
    # la salienza della scelta deve staccarsi dalla media del frame
    voiced &= peak > 1.4 * sal.mean(axis=0)
    track = np.where(voiced, midis[best], 0).astype(float)
    track = ndimage.median_filter(track, size=7)
    return track, peak


def notes_from_track(track: np.ndarray, fps: float, min_dur: float = 0.1) -> list[dict]:
    notes = []
    cur, start = 0.0, 0
    for i, m in enumerate(np.append(track, 0)):
        if m != cur:
            if cur > 0 and (i - start) / fps >= min_dur:
                notes.append({"midi": int(cur), "start": round(start / fps, 3), "dur": round((i - start) / fps, 3)})
            cur, start = m, i
    return notes


def tab_positions(notes: list[dict], tuning: list[int] = STANDARD, max_fret: int = 15) -> list[dict]:
    """Corda/tasto per ogni nota restando il più possibile nella stessa zona del manico."""
    if not notes:
        return []
    out = []
    pos = None  # tasto centrale della mano
    for n in notes:
        options = [(s, n["midi"] - open_) for s, open_ in enumerate(tuning) if 0 <= n["midi"] - open_ <= max_fret]
        if not options:
            continue
        if pos is None:
            s, fret = min(options, key=lambda o: (o[1] if o[1] > 0 else 0.5))
        else:
            s, fret = min(options, key=lambda o: abs((o[1] or pos) - pos) + (0.3 if o[1] == 0 else 0))
        if fret > 0:
            pos = fret if pos is None else 0.6 * pos + 0.4 * fret
        out.append({**n, "string": 6 - s, "fret": fret})
    return out


def melody(spec_harm: Spec, limit: int = 96) -> dict:
    track, _ = salience_track(spec_harm)
    notes = notes_from_track(track, spec_harm.fps)
    tabbed = tab_positions(notes[:limit])
    frets = [n["fret"] for n in tabbed if n["fret"] > 0]
    zone = int(np.median(frets)) if frets else 0
    return {
        "notes": tabbed,
        "total_notes": len(notes),
        "suggested_position": max(1, zone - 1) if zone else 0,
        "method": "salienza armonica (indicativa)",
    }
