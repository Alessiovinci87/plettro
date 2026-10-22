"""Pennata: dove cadono i colpi nella misura, con che forza e in che direzione.

Si misura l'attacco della chitarra su una griglia di sedicesimi agganciata ai
battiti reali, si fa la media sulle misure della sezione e si ricava un
pattern. La direzione segue la regola del "pendolo": la mano scende sui
tempi forti della suddivisione e sale sui levare, come fanno i chitarristi.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .dsp import Spec, spectral_flux


@dataclass
class StrumResult:
    steps: str  # 'D','U','d','u','-' per sedicesimo (o per ottavo se in 3)
    subdivision: str  # "ottavi" | "sedicesimi" | "terzine"
    swing: bool
    strength: list[float]
    palm_mute: bool
    hits_per_bar: float
    confidence: float
    advice: str

    def to_dict(self) -> dict:
        return {
            "steps": self.steps,
            "subdivision": self.subdivision,
            "swing": self.swing,
            "strength": [round(x, 3) for x in self.strength],
            "palm_mute": self.palm_mute,
            "hits_per_bar": round(self.hits_per_bar, 1),
            "confidence": round(self.confidence, 2),
            "advice": self.advice,
        }


def guitar_onsets(spec: Spec) -> np.ndarray:
    """Attacchi "tonali" della chitarra: flusso spettrale sui soli picchi armonici
    (spettro sbiancato) nella banda 1-5 kHz: lì l'attacco del plettro sulle corde è netto,
    mentre basso e cassa quasi non arrivano e rullante e piatti (rumore) vengono sbiancati."""
    from scipy import ndimage

    band = spec.band(1000, 5000)
    mag = spec.mag[band]
    floor = ndimage.median_filter(mag, size=(15, 1), mode="nearest")
    peaks = np.maximum(0.0, mag - 1.5 * floor)
    tonal = Spec(np.vstack([np.zeros((1, mag.shape[1])), peaks]), np.r_[0.0, spec.freqs[band]], spec.hop, spec.sr)
    return spectral_flux(tonal, 0, 1e9)


def bar_profiles(env: np.ndarray, fps: float, beats: np.ndarray, first_beat: int, meter: int, n_bars: int) -> np.ndarray:
    """Per ogni battuta, la forza degli attacchi sui suoi sedicesimi (meter*4, n_bars),
    normalizzata per battuta: descrive il ritmo della chitarra a prescindere dal volume."""
    out = np.zeros((meter * 4, n_bars), dtype=np.float32)
    for bar in range(n_bars):
        for k in range(meter):
            bi = first_beat + bar * meter + k
            if bi + 1 >= len(beats):
                break
            b0, d = beats[bi], beats[bi + 1] - beats[bi]
            for q in range(4):
                out[k * 4 + q, bar] = _sample(env, fps, b0 + q * d / 4, d / 12)
        m = out[:, bar].max()
        if m > 0:
            out[:, bar] /= m
    return out


def _sample(env: np.ndarray, fps: float, t: float, half: float) -> float:
    a = max(0, int((t - half) * fps))
    b = min(len(env), int((t + half) * fps) + 1)
    return float(env[a:b].max()) if b > a else 0.0


def analyze_section(
    env: np.ndarray,
    fps: float,
    beats: np.ndarray,
    first_beat: int,
    n_beats: int,
    meter: int,
    hf_ratio: float,
    decay: float,
) -> StrumResult:
    """env: attacchi chitarra; beats: tutti i battiti; analizza n_beats a partire da first_beat."""
    steps_per_beat = 4
    grid = meter * steps_per_beat
    acc = np.zeros(grid)
    trip = np.zeros(meter)  # forza alla posizione 2/3 del battito (swing)
    eighth = np.zeros(meter)
    cnt = np.zeros(grid)
    bars = 0
    for bi in range(first_beat, min(first_beat + n_beats, len(beats) - 1)):
        b0, b1 = beats[bi], beats[bi + 1]
        d = b1 - b0
        pos_in_bar = (bi - first_beat) % meter
        if pos_in_bar == 0:
            bars += 1
        half = d / 12
        vals = [_sample(env, fps, b0 + k * d / 4, half) for k in range(4)]
        local = max(vals) + 1e-9
        for k, v in enumerate(vals):
            acc[pos_in_bar * 4 + k] += v
            cnt[pos_in_bar * 4 + k] += 1
        trip[pos_in_bar] += _sample(env, fps, b0 + 2 * d / 3, half) / local
        eighth[pos_in_bar] += vals[2] / local
    if bars == 0 or cnt.max() == 0:
        return StrumResult("-" * grid, "ottavi", False, [0.0] * grid, False, 0, 0.0, "Sezione troppo corta per leggere la pennata.")
    acc = acc / np.maximum(cnt, 1)
    raw = acc / (acc.max() + 1e-9)
    # toglie il "fondo" (corde che suonano, rumore): conta solo quanto un colpo spicca
    base = float(np.percentile(raw, 20))
    norm = np.clip((raw - base) / (1 - base + 1e-9), 0, 1)

    swing = bool(trip.sum() > eighth.sum() * 1.25 and trip.mean() > 0.45)
    odd = norm[1::2].mean()
    even = norm[0::2].mean()
    sixteenth = odd > 0.45 * even and odd > 0.25
    subdivision = "terzine" if swing else ("sedicesimi" if sixteenth else "ottavi")

    # soglie relative: forte / leggera / assente
    strong_t, weak_t = 0.5, 0.22
    out = []
    for i, v in enumerate(norm):
        k = i % 4
        if not sixteenth and k in (1, 3):
            out.append("-")
            continue
        if sixteenth:
            down = k % 2 == 0
        else:
            down = k == 0
        if v >= strong_t:
            out.append("D" if down else "U")
        elif v >= weak_t:
            out.append("d" if down else "u")
        else:
            out.append("-")
    steps = "".join(out)
    hits = sum(c != "-" for c in steps)
    contrast = float(norm.max() - np.median(norm))
    confidence = float(np.clip(contrast * min(1.0, bars / 4), 0, 1))
    palm = bool(hf_ratio < 0.12 and decay > 25)
    return StrumResult(steps, subdivision, swing, norm.tolist(), palm, hits, confidence, _advice(steps, subdivision, swing, palm, meter))


def _advice(steps: str, sub: str, swing: bool, palm: bool, meter: int) -> str:
    parts = []
    hits = sum(c != "-" for c in steps)
    if hits <= meter:
        parts.append("Pennate larghe sui battiti: lascia suonare l'accordo.")
    elif sub == "sedicesimi":
        parts.append("Mano a sedicesimi costanti: il braccio va su e giù senza fermarsi, colpisci solo dove indicato.")
    else:
        parts.append("Mano a ottavi: giù sui battiti, su sui levare.")
    if swing:
        parts.append("Il ritmo è swingato (shuffle): i levare arrivano in ritardo, pensa in terzine.")
    accents = [i for i, c in enumerate(steps) if c in "DU"]
    if accents and meter == 4 and any(i in (4, 12) for i in accents) and steps[0] != "D":
        parts.append("Accento sul 2 e sul 4.")
    if palm:
        parts.append("Suono corto e scuro: probabile palm mute (palmo appoggiato vicino al ponte).")
    return " ".join(parts)
