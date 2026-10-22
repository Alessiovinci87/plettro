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


def _quiet_tail(bar_energy: np.ndarray) -> int:
    """Numero di battute finali quasi silenziose (coda del riverbero, silenzio)."""
    floor = float(np.median(bar_energy)) - QUIET_DB
    n = 0
    while n < len(bar_energy) and bar_energy[-1 - n] < floor:
        n += 1
    return n


def segment(bar_feat: np.ndarray, bar_times: np.ndarray, bar_energy: np.ndarray, bar_chroma: np.ndarray | None = None) -> list[Section]:
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

    # raggruppamento: sezioni con feature medie simili ricevono la stessa lettera
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
        if i == 0 and (s.end_bar - s.start_bar) <= 8 and len(secs) > 2 and s.energy < secs[1].energy and count[s.group] <= 2 and s.group not in (chorus,):
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
