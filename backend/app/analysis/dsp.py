"""Strumenti DSP di base, solo numpy/scipy (nessuna dipendenza pesante)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage, signal

SR = 22050


@dataclass
class Spec:
    mag: np.ndarray  # (bins, frames)
    freqs: np.ndarray
    hop: int
    sr: int

    @property
    def fps(self) -> float:
        return self.sr / self.hop

    def times(self) -> np.ndarray:
        return np.arange(self.mag.shape[1]) * self.hop / self.sr

    def band(self, lo: float, hi: float) -> np.ndarray:
        return (self.freqs >= lo) & (self.freqs < hi)


def stft(y: np.ndarray, sr: int = SR, n_fft: int = 2048, hop: int = 512) -> Spec:
    """Magnitudo STFT centrata (frame k centrato su k*hop)."""
    pad = n_fft // 2
    yp = np.pad(y, (pad, pad), mode="reflect" if len(y) > pad else "constant")
    n_frames = 1 + (len(yp) - n_fft) // hop
    if n_frames <= 0:
        return Spec(np.zeros((n_fft // 2 + 1, 0)), np.fft.rfftfreq(n_fft, 1 / sr), hop, sr)
    win = np.hanning(n_fft).astype(np.float32)
    idx = np.arange(n_fft)[None, :] + hop * np.arange(n_frames)[:, None]
    mag = np.empty((n_fft // 2 + 1, n_frames), dtype=np.float32)
    step = 2048  # a blocchi per non esplodere in memoria su brani lunghi
    for s in range(0, n_frames, step):
        frames = yp[idx[s : s + step]] * win
        mag[:, s : s + step] = np.abs(np.fft.rfft(frames, axis=1)).T
    return Spec(mag, np.fft.rfftfreq(n_fft, 1 / sr), hop, sr)


def hpss_masks(mag: np.ndarray, kernel: int = 17, power: float = 2.0) -> tuple[np.ndarray, np.ndarray]:
    """Separazione armonico/percussivo (Fitzgerald 2010) con maschere morbide."""
    h = ndimage.median_filter(mag, size=(1, kernel), mode="nearest")
    p = ndimage.median_filter(mag, size=(kernel, 1), mode="nearest")
    hp, pp = h**power, p**power
    tot = hp + pp + 1e-10
    return hp / tot, pp / tot


def spectral_flux(spec: Spec, lo: float = 0.0, hi: float = 1e9, log_c: float = 100.0) -> np.ndarray:
    """Onset strength: aumento positivo del log-spettro nella banda indicata."""
    band = spec.band(lo, hi)
    m = np.log1p(log_c * spec.mag[band])
    if m.shape[1] < 2:
        return np.zeros(m.shape[1])
    d = np.diff(m, axis=1)
    d[d < 0] = 0
    flux = np.concatenate([[0.0], d.mean(axis=0)])
    # sottrae l'andamento lento per isolare gli attacchi
    local = ndimage.uniform_filter1d(flux, size=max(3, int(spec.fps * 0.2)))
    return np.maximum(0.0, flux - local)


def rms_db(y: np.ndarray, frame: int = 2048, hop: int = 512) -> np.ndarray:
    if len(y) < frame:
        y = np.pad(y, (0, frame - len(y)))
    n = 1 + (len(y) - frame) // hop
    idx = np.arange(frame)[None, :] + hop * np.arange(n)[:, None]
    r = np.sqrt(np.mean(y[idx] ** 2, axis=1) + 1e-12)
    return 20 * np.log10(r)


def pitch_salience(spec: Spec, lo: int, hi: int, weights: tuple[float, ...] = (1.0, 0.5, 0.33, 0.25), a4: float = 440.0) -> np.ndarray:
    """Salienza per semitono (MIDI lo..hi): somma pesata delle armoniche lette sullo
    spettro sbiancato, campionato esattamente alle frequenze delle note."""
    floor = ndimage.median_filter(spec.mag, size=(31, 1), mode="nearest")
    peaks = np.sqrt(np.maximum(0.0, spec.mag - 1.5 * floor))
    df = spec.freqs[1] - spec.freqs[0]
    nb = peaks.shape[0]
    out = np.zeros((hi - lo + 1, peaks.shape[1]), dtype=np.float32)
    for i, m in enumerate(range(lo, hi + 1)):
        f0 = a4 * 2 ** ((m - 69) / 12)
        for h, w in enumerate(weights, start=1):
            j = int(round(f0 * h / df))
            if j + 1 >= nb:
                break
            out[i] += w * peaks[max(0, j - 1) : j + 2].max(axis=0)
    return out


def chroma(spec: Spec, lo: int = 36, hi: int = 84, weights: tuple[float, ...] = (1.0, 0.5, 0.33, 0.25)) -> np.ndarray:
    """Cromagramma (12, frames) piegando la salienza dei semitoni sulle 12 classi."""
    sal = pitch_salience(spec, lo, hi, weights)
    out = np.zeros((12, sal.shape[1]), dtype=np.float32)
    for i, m in enumerate(range(lo, hi + 1)):
        out[m % 12] += sal[i]
    return out


def normalize_cols(x: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(x, axis=0, keepdims=True)
    return x / np.maximum(n, 1e-9)


def sync(features: np.ndarray, frame_times: np.ndarray, bounds: np.ndarray, agg=np.median) -> np.ndarray:
    """Aggrega le colonne di `features` tra i tempi consecutivi in `bounds`."""
    out = np.zeros((features.shape[0], max(0, len(bounds) - 1)), dtype=np.float32)
    for i in range(len(bounds) - 1):
        a, b = np.searchsorted(frame_times, [bounds[i], bounds[i + 1]])
        if b <= a:
            b = min(a + 1, features.shape[1])
            a = max(0, b - 1)
        if b > a:
            out[:, i] = agg(features[:, a:b], axis=1)
    return out


def bandpass(y: np.ndarray, lo: float, hi: float, sr: int = SR) -> np.ndarray:
    sos = signal.butter(4, [lo, min(hi, sr / 2 * 0.95)], btype="band", fs=sr, output="sos")
    return signal.sosfiltfilt(sos, y)


def peak_pick(x: np.ndarray, min_dist: int, thresh: float) -> np.ndarray:
    peaks, _ = signal.find_peaks(x, distance=max(1, min_dist), height=thresh)
    return peaks
