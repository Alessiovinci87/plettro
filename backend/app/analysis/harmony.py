"""Tonalità (Krumhansl-Kessler) e accordi (template + HMM/Viterbi a livello di battito)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# Profili di Krumhansl & Kessler
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Qualità riconosciute: id compatibili con il frontend (theory.ts)
CHORD_QUALITIES: dict[str, tuple[list[int], str]] = {
    "major": ([0, 4, 7], ""),
    "minor": ([0, 3, 7], "m"),
    "7": ([0, 4, 7, 10], "7"),
    "m7": ([0, 3, 7, 10], "m7"),
    "maj7": ([0, 4, 7, 11], "maj7"),
    "sus4": ([0, 5, 7], "sus4"),
    "sus2": ([0, 2, 7], "sus2"),
    "dim": ([0, 3, 6], "dim"),
    "5": ([0, 7], "5"),
}
# Le tetradi devono "battere" le triadi di questo margine per essere scelte.
COMPLEXITY_PENALTY = {"major": 0.0, "minor": 0.0, "7": 0.07, "m7": 0.08, "maj7": 0.09, "sus4": 0.07, "sus2": 0.07, "dim": 0.08, "5": 0.1}


@dataclass
class Key:
    tonic: int
    mode: str  # "major" | "minor"
    confidence: float

    @property
    def name(self) -> str:
        return NAMES[self.tonic] + ("m" if self.mode == "minor" else "")

    def label_it(self) -> str:
        return f"{NAMES[self.tonic]} {'maggiore' if self.mode == 'major' else 'minore'}"


def estimate_key(chroma_mean: np.ndarray) -> Key:
    c = (chroma_mean - chroma_mean.mean()) / (chroma_mean.std() + 1e-9)
    scores = []
    for mode, prof in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
        p = (prof - prof.mean()) / prof.std()
        for t in range(12):
            scores.append((float(np.dot(c, np.roll(p, t)) / 12), t, mode))
    scores.sort(reverse=True)
    best, second = scores[0], scores[1]
    conf = float(np.clip((best[0] - second[0]) * 4 + best[0] * 0.5, 0, 1))
    return Key(tonic=best[1], mode=best[2], confidence=conf)


def diatonic_chords(key: Key) -> set[tuple[int, str]]:
    t = key.tonic
    if key.mode == "major":
        degs = [(0, "major"), (2, "minor"), (4, "minor"), (5, "major"), (7, "major"), (9, "minor"), (11, "dim"), (7, "7")]
    else:
        degs = [(0, "minor"), (2, "dim"), (3, "major"), (5, "minor"), (7, "minor"), (7, "major"), (7, "7"), (8, "major"), (10, "major")]
    out = {((t + d) % 12, q) for d, q in degs}
    # le estensioni comuni sui gradi diatonici
    for r, q in list(out):
        if q == "minor":
            out.add((r, "m7"))
        if q == "major":
            out.add((r, "maj7"))
            out.add((r, "sus4"))
            out.add((r, "sus2"))
    return out


@dataclass
class ChordSeg:
    root: int
    quality: str
    start: float
    end: float
    beats: int

    @property
    def symbol(self) -> str:
        return NAMES[self.root] + CHORD_QUALITIES[self.quality][1]

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "root": self.root,
            "quality": self.quality,
            "start": round(self.start, 3),
            "end": round(self.end, 3),
            "beats": self.beats,
        }


def _templates() -> tuple[np.ndarray, list[tuple[int, str]]]:
    temps, labels = [], []
    for q, (ivs, _) in CHORD_QUALITIES.items():
        for r in range(12):
            v = np.zeros(12)
            for i, iv in enumerate(ivs):
                v[(r + iv) % 12] = 1.0 if i < 3 else 0.8
            v[r] += 0.15  # la fondamentale pesa un po' di più
            temps.append(v / np.linalg.norm(v))
            labels.append((r, q))
    return np.array(temps), labels


def recognize_chords(
    beat_chroma: np.ndarray,
    beat_bass: np.ndarray,
    beat_energy: np.ndarray,
    beat_times: np.ndarray,
    key: Key,
    stay: float = 0.9,
) -> list[ChordSeg]:
    """beat_chroma: (12, B) normalizzato; beat_bass: (12, B); beat_times: B+1 confini."""
    T, labels = _templates()
    B = beat_chroma.shape[1]
    if B == 0:
        return []
    sim = T @ beat_chroma  # (S, B)
    pen = np.array([COMPLEXITY_PENALTY[q] for _, q in labels])[:, None]
    sim = sim - pen
    diat = diatonic_chords(key)
    sim += np.array([0.04 if lab in diat else 0.0 for lab in labels])[:, None]
    # basso: se la nota più grave coincide con la fondamentale, conferma
    bass_n = beat_bass / (beat_bass.max(axis=0, keepdims=True) + 1e-9)
    roots = np.array([r for r, _ in labels])
    sim += 0.12 * bass_n[roots, :]
    # stato "nessun accordo" per il silenzio
    silent = beat_energy < (np.percentile(beat_energy, 90) * 0.06 if B > 3 else 0)
    n_sim = np.where(silent, 1.0, 0.2)[None, :]
    sim = np.vstack([sim, n_sim])
    S = sim.shape[0]
    log_e = 12.0 * sim  # emissioni "softmax" con temperatura
    log_e -= log_e.max(axis=0, keepdims=True)
    log_stay = np.log(stay)
    log_move = np.log((1 - stay) / (S - 1))
    # Viterbi
    delta = log_e[:, 0].copy()
    psi = np.zeros((S, B), dtype=int)
    for b in range(1, B):
        best_prev = int(np.argmax(delta))
        move = delta[best_prev] + log_move
        stay_v = delta + log_stay
        choose_stay = stay_v >= move
        psi[:, b] = np.where(choose_stay, np.arange(S), best_prev)
        delta = np.where(choose_stay, stay_v, move) + log_e[:, b]
    path = np.zeros(B, dtype=int)
    path[-1] = int(np.argmax(delta))
    for b in range(B - 1, 0, -1):
        path[b - 1] = psi[path[b], b]
    segs: list[ChordSeg] = []
    for b, s in enumerate(path):
        if s == S - 1:
            continue  # nessun accordo
        r, q = labels[s]
        if segs and segs[-1].root == r and segs[-1].quality == q and abs(segs[-1].end - beat_times[b]) < 1e-6:
            segs[-1].end = float(beat_times[b + 1])
            segs[-1].beats += 1
        else:
            segs.append(ChordSeg(r, q, float(beat_times[b]), float(beat_times[b + 1]), 1))
    return _absorb_blips(segs)


def _absorb_blips(segs: list[ChordSeg]) -> list[ChordSeg]:
    """Accordi di un solo battito tra due uguali sono quasi sempre errori."""
    out: list[ChordSeg] = []
    for i, s in enumerate(segs):
        prev = out[-1] if out else None
        nxt = segs[i + 1] if i + 1 < len(segs) else None
        if s.beats == 1 and prev and nxt and prev.root == nxt.root and prev.quality == nxt.quality:
            prev.end = s.end
            prev.beats += 1
            continue
        if prev and prev.root == s.root and prev.quality == s.quality:
            prev.end = s.end
            prev.beats += s.beats
            continue
        out.append(s)
    return out
