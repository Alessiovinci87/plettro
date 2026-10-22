"""Sezioni del brano: confini dalla novità (matrice di auto-somiglianza a livello di misura),
raggruppamento delle sezioni simili e nomi probabili (intro, strofa, ritornello...)."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .dsp import normalize_cols


@dataclass
class Section:
    start_bar: int
    end_bar: int  # esclusivo
    start: float
    end: float
    group: str = "A"
    label: str = "Sezione"
    energy: float = 0.0  # 0..1 relativo al brano
    extra: dict = field(default_factory=dict)


W_HARMONY, W_RHYTHM, W_ENERGY = 1.0, 0.0, 0.0  # ritmo ed energia nella novità peggiorano i confini (bench.py)


def bar_features(bar_chroma: np.ndarray, bar_rhythm: np.ndarray, bar_db: np.ndarray) -> np.ndarray:
    """Feature per battuta: armonia, ritmo della chitarra ed energia, ciascuna centrata e
    normalizzata, poi pesata. Intro e strofa hanno spesso gli stessi accordi ma ritmo e
    volume diversi: senza queste due componenti si fondono."""

    def block(x: np.ndarray, w: float) -> np.ndarray:
        x = x - x.mean(axis=1, keepdims=True)
        n = np.linalg.norm(x, axis=0, keepdims=True)
        return w * x / max(float(np.median(n)), 1e-9)

    e = np.clip(bar_db, np.median(bar_db) - 20, None)[None, :]
    e = (e - e.mean()) / max(float(e.std()), 1e-9)
    return np.vstack([block(bar_chroma, W_HARMONY), block(bar_rhythm, W_RHYTHM), W_ENERGY * e])


def _novelty(feat: np.ndarray, k: int) -> np.ndarray:
    S = feat.T @ feat  # coseno, feat normalizzate per colonna
    n = S.shape[0]
    g = np.outer(np.r_[-np.ones(k), np.ones(k)], np.r_[-np.ones(k), np.ones(k)])
    g *= np.exp(-0.5 * (np.linspace(-1.5, 1.5, 2 * k)[:, None] ** 2 + np.linspace(-1.5, 1.5, 2 * k)[None, :] ** 2))
    Sp = np.pad(S, k, mode="edge")
    nov = np.array([np.sum(Sp[i : i + 2 * k, i : i + 2 * k] * -g) for i in range(n)])
    nov -= nov.min()
    return nov / (nov.max() + 1e-9)


QUIET_DB = 20.0  # sotto la mediana del brano: battuta quasi silenziosa


def _find_intro(secs: list[Section], rhythm: np.ndarray, db: np.ndarray, bar_times: np.ndarray) -> list[Section]:
    """Cerca un'intro nelle prime battute: più piano e/o con un ritmo diverso da quello che segue.

    Intro e strofa hanno spesso gli stessi accordi, quindi la novità armonica non le separa:
    qui si confrontano le prime k battute (k = 2..8) con le 4 successive.
    """
    N = rhythm.shape[1]
    best_k, best = 0, 0.0
    for k in range(2, min(9, N - 4)):
        quieter = float(np.mean(db[k : k + 4]) - np.mean(db[:k]))
        a = rhythm[:, :k].mean(axis=1)
        b = rhythm[:, k : k + 4].mean(axis=1)
        cos = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        # le battute dentro l'intro devono somigliarsi tra loro
        inner = rhythm[:, :k]
        coh = float(np.mean([inner[:, i] @ a / (np.linalg.norm(inner[:, i]) * np.linalg.norm(a) + 1e-9) for i in range(k)]))
        score = max(0.0, quieter - 1.5) / 3 + max(0.0, 0.9 - cos) * 3
        score *= coh
        # a parità, preferisci intro di 2, 4 o 8 battute
        if k in (2, 4, 8):
            score *= 1.15
        if score > best:
            best_k, best = k, score
    if best < 0.35 or best_k == 0:
        return secs
    k = best_k
    intro = Section(0, k, float(bar_times[0]), float(bar_times[k]))
    intro.extra["intro"] = True
    rest: list[Section] = []
    for s in secs:
        if s.end_bar <= k:
            continue
        if s.start_bar < k:
            s = Section(k, s.end_bar, float(bar_times[k]), s.end, s.group, s.label, s.energy, dict(s.extra))
        rest.append(s)
    # un pezzo rimasto troppo corto dopo l'intro si unisce al successivo
    if len(rest) > 1 and rest[0].end_bar - rest[0].start_bar < 2:
        rest[1] = Section(rest[0].start_bar, rest[1].end_bar, rest[0].start, rest[1].end, rest[1].group, rest[1].label, rest[1].energy, dict(rest[1].extra))
        rest = rest[1:]
    return [intro, *rest]


def _quiet_tail(bar_energy: np.ndarray) -> int:
    """Numero di battute finali quasi silenziose (coda del riverbero, silenzio)."""
    floor = float(np.median(bar_energy)) - QUIET_DB
    n = 0
    while n < len(bar_energy) and bar_energy[-1 - n] < floor:
        n += 1
    return n


def segment(bar_feat: np.ndarray, bar_times: np.ndarray, bar_energy: np.ndarray, bar_chroma: np.ndarray | None = None, bar_rhythm: np.ndarray | None = None) -> list[Section]:
    """bar_feat: (D, N) feature per misura; bar_times: N+1 confini in secondi; bar_energy in dB."""
    N_all = bar_feat.shape[1]
    if N_all == 0:
        return []
    if N_all < 8:
        return [Section(0, N_all, float(bar_times[0]), float(bar_times[-1]), "A", "Brano", 1.0)]
    # la coda silenziosa falserebbe la novità sulle ultime battute: resta fuori dalla segmentazione
    tail = _quiet_tail(bar_energy)
    N = N_all - tail if N_all - tail >= 8 else N_all
    f = normalize_cols(bar_feat[:, :N] - bar_feat[:, :N].mean(axis=1, keepdims=True))
    nov = _novelty(f, k=4)
    # confini: picchi di novità, preferibilmente ogni 4 misure
    cand = [i for i in range(2, N - 1) if nov[i] >= nov[i - 1] and nov[i] >= nov[i + 1] and nov[i] > 0.3]
    cand.sort(key=lambda i: -(nov[i] + (0.15 if i % 4 == 0 else 0)))
    bounds: list[int] = []
    for c in cand:
        if all(abs(c - b) >= 4 for b in bounds) and c >= 4 and N - c >= 2:
            bounds.append(c)
    bounds = sorted(bounds)
    edges = [0, *bounds, N]
    secs = [Section(a, b, float(bar_times[a]), float(bar_times[b])) for a, b in zip(edges[:-1], edges[1:])]

    # energia relativa
    e = bar_energy
    rng = (e.max() - e.min()) or 1.0
    for s in secs:
        s.energy = float((e[s.start_bar : s.end_bar].mean() - e.min()) / rng)

    if bar_rhythm is not None:
        secs = _find_intro(secs, bar_rhythm[:, :N], bar_energy[:N], bar_times)
        for s in secs:
            s.energy = float((e[s.start_bar : s.end_bar].mean() - e.min()) / rng)

    # raggruppamento: armonia media simile ed energia simile → stessa lettera
    src = bar_chroma if bar_chroma is not None else bar_feat
    means = [normalize_cols(src[:, s.start_bar : s.end_bar].mean(axis=1, keepdims=True))[:, 0] for s in secs]
    groups: list[int] = []
    reps: list[np.ndarray] = []
    rep_energy: list[float] = []
    for m, s in zip(means, secs):
        sims = [float(m @ r) - 1.5 * abs(s.energy - re) for r, re in zip(reps, rep_energy)]
        if sims and max(sims) > 0.9:
            groups.append(int(np.argmax(sims)))
        else:
            groups.append(len(reps))
            reps.append(m)
            rep_energy.append(s.energy)
    for s, g in zip(secs, groups):
        s.group = chr(ord("A") + min(g, 25))
    if secs and secs[0].extra.get("intro"):
        secs[0].group = "Z"
    # sezioni consecutive dello stesso gruppo sono una sola: energia pesata sulle battute
    merged: list[Section] = []
    for s in secs:
        p = merged[-1] if merged else None
        if p is not None and p.group == s.group:
            nb, ns = p.end_bar - p.start_bar, s.end_bar - s.start_bar
            p.energy = (p.energy * nb + s.energy * ns) / (nb + ns)
            p.end_bar, p.end = s.end_bar, s.end
        else:
            merged.append(s)
    secs = merged
    _name(secs)
    if N < N_all and secs[-1].label == "Finale":
        secs[-1].end_bar, secs[-1].end = N_all, float(bar_times[N_all])
    elif N < N_all:
        energy = float((e[N:].mean() - e.min()) / rng)
        group = chr(ord("A") + min(max(groups) + 1, 25))
        secs.append(Section(N, N_all, float(bar_times[N]), float(bar_times[N_all]), group, "Finale", energy))
    return secs


def _name(secs: list[Section]) -> None:
    from collections import Counter

    count = Counter(s.group for s in secs)
    energy_by_group = {g: np.mean([s.energy for s in secs if s.group == g]) for g in count}
    repeated = [g for g, c in count.items() if c >= 2]
    chorus = max(repeated, key=lambda g: energy_by_group[g], default=None)
    verse = None
    if chorus:
        others = [g for g in repeated if g != chorus]
        verse = max(others, key=lambda g: count[g], default=None)
    for i, s in enumerate(secs):
        if i == 0 and s.extra.get("intro"):
            s.label = "Intro"
        elif i == 0 and (s.end_bar - s.start_bar) <= 8 and len(secs) > 2 and s.energy < secs[1].energy and count[s.group] <= 2 and s.group not in (chorus,):
            s.label = "Intro"
        elif s.group == chorus:
            s.label = "Ritornello"
        elif s.group == verse:
            s.label = "Strofa"
        elif i == 0 and (s.end_bar - s.start_bar) <= 8 and len(secs) > 1 and s.energy <= secs[1].energy:
            s.label = "Intro"
        elif i == len(secs) - 1 and count[s.group] == 1:
            s.label = "Finale"
        elif count[s.group] == 1 and 0 < i < len(secs) - 1:
            s.label = "Bridge" if s.energy >= 0.35 else "Stacco"
        else:
            s.label = "Strofa" if not verse else "Sezione"
    # numerazione: "Strofa 2", "Ritornello 3"
    seen: Counter = Counter()
    tot = Counter(s.label for s in secs)
    for s in secs:
        seen[s.label] += 1
        if tot[s.label] > 1:
            s.label = f"{s.label} {seen[s.label]}"
