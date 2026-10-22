"""Benchmark delle sezioni su brani sintetici con seed diversi. Non è un test.

Esegui dalla cartella backend:  python scripts/bench_sections.py [seed ...]

Per ogni seed stampa le sezioni trovate e due punteggi:
- confini: confini veri con un confine trovato entro 1 battuta (più quelli in eccesso);
- etichette: sezioni vere la cui sezione trovata più sovrapposta ha l'etichetta giusta.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("PLETTRO_DISABLE_DEMUCS", "1")

from app.analysis.audio_io import save_wav  # noqa: E402
from app.analysis.pipeline import analyze_file  # noqa: E402
from tests.synth import song  # noqa: E402

SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]
LABELS = {"intro": "Intro", "verse": "Strofa", "chorus": "Ritornello"}


def boundaries(spans: list[tuple[float, float]]) -> list[float]:
    return [a for a, _ in spans] + [spans[-1][1]]


def score(found: list[dict], truth: list[tuple[str, float, float]], beat: float) -> tuple[int, int, int, int]:
    """Restituisce (confini presi, confini veri, confini in eccesso, etichette giuste)."""
    tb = boundaries([(a, b) for _, a, b in truth])
    fb = boundaries([(s["start"], s["end"]) for s in found])
    hit = sum(any(abs(t - f) <= beat for f in fb) for t in tb)
    extra = sum(not any(abs(t - f) <= beat for t in tb) for f in fb)
    good = 0
    for name, a, b in truth:
        best = max(found, key=lambda s: min(b, s["end"]) - max(a, s["start"]))
        good += best["label"].split()[0] == LABELS[name]
    return hit, len(tb), extra, good


def main(seeds: list[int]) -> None:
    tot = [0, 0, 0, 0, 0]
    with tempfile.TemporaryDirectory() as d:
        for seed in seeds:
            y, truth = song(seed=seed)
            p = Path(d) / f"seed{seed}.wav"
            save_wav(p, y)
            secs = analyze_file(str(p))["sections"]
            hit, nb, extra, good = score(secs, truth["sections"], 60 / truth["bpm"])
            print(f"seed {seed}: confini {hit}/{nb} (+{extra} in eccesso), etichette {good}/{len(truth['sections'])}")
            for s in secs:
                print(f"  {s['label']:<14}{s['start']:>7.2f}{s['end']:>7.2f}  energia {s['energy']:.3f}")
            for i, v in enumerate((hit, nb, extra, good, len(truth["sections"]))):
                tot[i] += v
    print(f"\ntotale: confini {tot[0]}/{tot[1]} (+{tot[2]} in eccesso), etichette {tot[3]}/{tot[4]}")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or SEEDS)
