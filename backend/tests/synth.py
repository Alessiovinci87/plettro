"""Generatore di brani sintetici con risposta nota, per verificare l'analisi."""
from __future__ import annotations

import numpy as np

SR = 22050
STD = [40, 45, 50, 55, 59, 64]
SHAPES = {
    "G": [3, 2, 0, 0, 0, 3],
    "C": [-1, 3, 2, 0, 1, 0],
    "Em": [0, 2, 2, 0, 0, 0],
    "D": [-1, -1, 0, 2, 3, 2],
    "Am": [-1, 0, 2, 2, 1, 0],
    "F": [1, 3, 3, 2, 1, 1],
}
ROOTS = {"G": 43, "C": 48, "Em": 40, "D": 50, "Am": 45, "F": 41}


_CACHE: dict = {}


def pluck(midi: int, dur: float, rng: np.random.Generator, bright: float = 0.5) -> np.ndarray:
    """Karplus-Strong vettoriale: ogni periodo è la media mobile del precedente."""
    key = (midi, int(rng.integers(0, 3)))
    base = _CACHE.get(key)
    if base is None:
        f = 440 * 2 ** ((midi - 69) / 12)
        n = int(SR / f)
        periods = int(2.5 * SR / n) + 1
        buf = np.empty((periods, n), dtype=np.float32)
        buf[0] = rng.uniform(-1, 1, n)
        for k in range(1, periods):
            prev = buf[k - 1]
            buf[k] = 0.996 * 0.5 * (prev + np.roll(prev, -1))
        base = buf.reshape(-1)
        _CACHE[key] = base
    return base[: int(dur * SR)]


def strum(chord: str, down: bool, dur: float, gain: float, rng) -> np.ndarray:
    midis = [STD[s] + f for s, f in enumerate(SHAPES[chord]) if f >= 0]
    if not down:
        midis = midis[::-1][:4]
    out = np.zeros(int((dur + 0.1) * SR), dtype=np.float32)
    for i, m in enumerate(midis):
        off = int(i * 0.012 * SR)
        p = pluck(m, dur, rng)
        out[off : off + len(p)] += p[: len(out) - off] * gain
    return out


FORMS = {
    # forma A: quella dei test (intro, strofa, ritornello, strofa, ritornello)
    "A": [
        ("intro", ["G", "C", "G", "C"], "quarters", 0.35, False),
        ("verse", ["Em", "C", "G", "D"] * 2, "folk", 0.55, False),
        ("chorus", ["G", "D", "Em", "C"] * 2, "eighths", 0.9, True),
        ("verse", ["Em", "C", "G", "D"] * 2, "folk", 0.55, False),
        ("chorus", ["G", "D", "Em", "C"] * 2, "eighths", 0.9, True),
    ],
    # forma B: in La minore, con finale tranquillo (solo per il benchmark)
    "B": [
        ("intro", ["Am", "Am", "F", "F"], "quarters", 0.3, False),
        ("verse", ["Am", "F", "C", "G"] * 2, "folk", 0.5, False),
        ("chorus", ["F", "G", "Am", "C"] * 2, "eighths", 0.85, True),
        ("verse", ["Am", "F", "C", "G"] * 2, "folk", 0.5, False),
        ("chorus", ["F", "G", "Am", "C"] * 2, "eighths", 0.85, True),
        ("outro", ["Am", "F", "Am", "Am"], "quarters", 0.3, False),
    ],
}
PATTERNS = {
    "quarters": "D---D---D---D---",
    "folk": "D---D-U---U-D-U-",
    "eighths": "D-U-D-U-D-U-D-U-",
}


def song(bpm: float = 100, seed: int = 1, bass_on: bool = True, drums_on: bool = True, form: str = "A") -> tuple[np.ndarray, dict]:
    # la cache cambia quanti numeri casuali consuma pluck: senza svuotarla
    # la prima chiamata produrrebbe un brano diverso dalle successive
    _CACHE.clear()
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    plan = FORMS[form]
    patterns = PATTERNS
    total_bars = sum(len(p[1]) for p in plan)
    n = int((total_bars * 4 * beat + 3) * SR)
    gtr = np.zeros(n, dtype=np.float32)
    drums = np.zeros(n, dtype=np.float32)
    bass = np.zeros(n, dtype=np.float32)
    truth = {"bpm": bpm, "sections": [], "chords": [], "patterns": [], "gains": []}
    t = 0.5
    for name, chords, pat, gain, dist in plan:
        sec_start = t
        sec = np.zeros(n, dtype=np.float32)
        for chord in chords:
            truth["chords"].append((round(t, 3), chord))
            for k, c in enumerate(patterns[pat]):
                if c == "-":
                    continue
                st = t + k * beat / 4
                s = strum(chord, c == "D", beat * 1.2, gain * (1 if c == "D" else 0.7), rng)
                i0 = int(st * SR)
                sec[i0 : i0 + len(s)] += s[: n - i0]
            # basso sulla fondamentale, sui battiti 1 e 3
            for b in (0, 2):
                i0 = int((t + b * beat) * SR)
                p = pluck(ROOTS[chord] - 12, beat * 1.5, rng)
                bass[i0 : i0 + len(p)] += 0.5 * p[: n - i0]
            # batteria: cassa 1 e 3, rullante 2 e 4
            for b in range(4):
                i0 = int((t + b * beat) * SR)
                L = int(0.12 * SR)
                env = np.exp(-np.arange(L) / (0.03 * SR))
                if b % 2 == 0:
                    tone = np.sin(2 * np.pi * 60 * np.arange(L) / SR * (1 - np.arange(L) / L * 0.5))
                    drums[i0 : i0 + L] += 0.9 * tone * env
                else:
                    drums[i0 : i0 + L] += 0.35 * rng.uniform(-1, 1, L) * env
            t += 4 * beat
        if dist:
            sec = np.tanh(3.5 * sec) * 0.6
        gtr += sec
        truth["sections"].append((name, round(sec_start, 2), round(t, 2)))
        truth["patterns"].append(patterns[pat])
        truth["gains"].append(gain)
    # un basso elettrico vero ha poca energia sopra 1 kHz: senza filtro il rumore
    # d'attacco del Karplus-Strong sembrerebbe una pennata di chitarra
    from scipy.signal import butter, sosfilt

    bass = sosfilt(butter(4, 900, fs=SR, output="sos"), bass).astype(np.float32)
    mix = gtr + (0.6 * drums if drums_on else 0) + (bass if bass_on else 0)
    truth["guitar"] = gtr / np.abs(gtr).max()
    mix /= np.abs(mix).max()
    return mix.astype(np.float32), truth
