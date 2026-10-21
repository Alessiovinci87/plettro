"""Tempo, battiti e misure.

- Tempo: autocorrelazione dell'inviluppo degli attacchi con un prior log-normale
  centrato su ~110 bpm e verifica delle ottave di tempo (metà / doppio).
- Battiti: programmazione dinamica (Ellis 2007).
- Metro e primo tempo: si confrontano le ipotesi 4/4 e 3/4 sugli accenti
  (attacchi + energia grave) e si sceglie fase e metro più coerenti.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .dsp import Spec, spectral_flux


@dataclass
class Rhythm:
    bpm: float
    confidence: float
    beats: np.ndarray  # secondi
    meter: int  # battiti per misura
    downbeat_index: int  # indice del primo battito "uno"
    onset_env: np.ndarray
    fps: float

    @property
    def beat_period(self) -> float:
        return 60.0 / self.bpm

    @property
    def downbeats(self) -> np.ndarray:
        return self.beats[self.downbeat_index :: self.meter]


def estimate_tempo(env: np.ndarray, fps: float, lo: float = 55, hi: float = 210, prior: float = 105) -> tuple[float, float]:
    e = env - env.mean()
    n = len(e)
    if n < fps * 4:
        return 120.0, 0.0
    f = np.fft.rfft(e, 2 * n)
    ac = np.fft.irfft(np.abs(f) ** 2)[:n]
    ac /= ac[0] + 1e-9
    lags = np.arange(n)
    with np.errstate(divide="ignore"):
        bpms = 60 * fps / np.maximum(lags, 1)
    valid = (bpms >= lo) & (bpms <= hi)
    # comb: un tempo vero ha picchi anche ai multipli del periodo
    # comb: un tempo vero ha picchi ai multipli del periodo E alla sua metà
    # (gli ottavi), mentre un falso tempo a 3/2 non ha la metà sostenuta.
    def at(x: np.ndarray) -> np.ndarray:
        i = np.clip(np.round(x).astype(int), 0, n - 1)
        return ac[i]

    comb = ac + 0.5 * at(lags * 2) + 0.33 * at(lags * 3) + 0.5 * at(lags / 2) + 0.25 * at(lags / 4)
    weight = np.exp(-0.5 * (np.log2(np.maximum(bpms, 1) / prior) / 0.9) ** 2)
    score = np.where(valid, comb * weight, -np.inf)
    best = int(np.argmax(score))
    # interpolazione parabolica sul picco
    if 1 <= best < n - 1 and np.isfinite(score[best - 1]) and np.isfinite(score[best + 1]):
        a, b, c = score[best - 1], score[best], score[best + 1]
        den = a - 2 * b + c
        shift = 0.5 * (a - c) / den if den != 0 else 0.0
    else:
        shift = 0.0
    lag = best + float(np.clip(shift, -0.5, 0.5))
    bpm = 60 * fps / lag
    fin = score[np.isfinite(score)]
    conf = float((score[best] - np.median(fin)) / (np.max(fin) - np.median(fin) + 1e-9)) if fin.size else 0.0
    return float(bpm), float(np.clip(ac[best], 0, 1) * 0.5 + 0.5 * np.clip(conf, 0, 1))


def track_beats(env: np.ndarray, fps: float, bpm: float, tightness: float = 100.0) -> np.ndarray:
    period = 60 * fps / bpm
    n = len(env)
    if n == 0:
        return np.array([])
    norm = env / (env.std() + 1e-9)
    # inviluppo smussato con una gaussiana di larghezza ~periodo/32
    w = np.exp(-0.5 * (np.arange(-period, period + 1) * 32 / period) ** 2)
    local = np.convolve(norm, w, mode="same")
    score = local.copy()
    back = np.full(n, -1, dtype=int)
    lo_off = int(round(period / 2))
    hi_off = int(round(period * 2))
    offs = np.arange(lo_off, hi_off + 1)
    penalty = -tightness * (np.log(offs / period)) ** 2
    for t in range(n):
        cand = t - offs
        ok = cand >= 0
        if not ok.any():
            continue
        vals = score[cand[ok]] + penalty[ok]
        j = int(np.argmax(vals))
        if vals[j] > 0:
            score[t] = local[t] + vals[j]
            back[t] = cand[ok][j]
    # ultimo battito: massimo locale nell'ultimo periodo
    tail = max(0, n - int(period * 1.5))
    t = tail + int(np.argmax(score[tail:]))
    beats = [t]
    while back[t] >= 0:
        t = back[t]
        beats.append(t)
    beats = np.array(beats[::-1], dtype=float)
    # scarta battiti iniziali nel silenzio
    thr = 0.1 * np.median(local[beats.astype(int)]) if len(beats) else 0
    keep = np.argmax(local[beats.astype(int)] > thr) if len(beats) else 0
    return beats[keep:] / fps


def _z(x: np.ndarray) -> np.ndarray:
    return (x - x.mean()) / (x.std() + 1e-9)


def choose_meter(beats: np.ndarray, accent: np.ndarray, fps: float, beat_change: np.ndarray | None = None) -> tuple[int, int, float]:
    """Restituisce (battiti per misura, indice primo 'uno', margine).

    beat_change: quanto cambia l'armonia su ogni battito; gli accordi cambiano
    quasi sempre sull'"uno", e questo distingue il primo dal terzo battito.
    """
    if len(beats) < 8:
        return 4, 0, 0.0
    idx = np.clip((beats * fps).astype(int), 0, len(accent) - 1)
    win = max(1, int(0.05 * fps))
    acc = _z(np.array([accent[max(0, i - win) : i + win + 1].max() for i in idx]))
    if beat_change is not None and len(beat_change) == len(acc):
        acc = acc + 1.5 * _z(beat_change)
    best = (4, 0, -np.inf)
    scores = {}
    for m in (4, 3):
        for ph in range(m):
            on = acc[ph::m]
            off = np.delete(acc, np.arange(ph, len(acc), m))
            s = on.mean() - off.mean()
            if m == 4:
                s *= 1.15  # il 4/4 è molto più comune
                # in 4/4 il terzo battito è spesso semi-forte: non deve vincere come "uno"
                third = acc[(ph + 2) % 4 :: 4]
                s += 0.1 * (on.mean() - third.mean())
            scores[(m, ph)] = s
            if s > best[2]:
                best = (m, ph, s)
    m, ph, s = best
    other = max(v for (mm, _), v in scores.items() if mm != m)
    return m, ph, float(s - other)


def refine_meter(rh: Rhythm, low_energy: np.ndarray, beat_change: np.ndarray) -> Rhythm:
    """Ricalcola metro e primo battito usando anche i cambi di accordo."""
    accent = rh.onset_env / (rh.onset_env.max() + 1e-9) + 0.7 * low_energy / (low_energy.max() + 1e-9)
    rh.meter, rh.downbeat_index, _ = choose_meter(rh.beats, accent, rh.fps, beat_change)
    return rh


def analyze_rhythm(spec_perc: Spec, low_energy: np.ndarray) -> Rhythm:
    env = spectral_flux(spec_perc)
    fps = spec_perc.fps
    bpm, conf = estimate_tempo(env, fps)
    beats = track_beats(env, fps, bpm)
    if len(beats) > 4:
        # tempo rifinito con una retta sui battiti (più preciso della griglia dei frame)
        period = float(np.polyfit(np.arange(len(beats)), beats, 1)[0])
        if 0.25 < period < 1.2:
            bpm = 60 / period
    accent = env / (env.max() + 1e-9) + 0.7 * low_energy / (low_energy.max() + 1e-9)
    meter, ph, _ = choose_meter(beats, accent, fps)
    return Rhythm(bpm=bpm, confidence=conf, beats=beats, meter=meter, downbeat_index=ph, onset_env=env, fps=fps)
