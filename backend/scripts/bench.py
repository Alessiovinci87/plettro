"""Benchmark completo dell'analisi su brani sintetici con risposta nota. Non è un test.

Esegui dalla cartella backend:  python scripts/bench.py [-v]

Due forme di brano (A in Sol, B in La minore con finale) × 4 seed. Misura:
- tempo: errore in bpm;
- accordi: % di battiti con l'accordo giusto (letto a metà battito);
- confini: confini veri trovati entro 1 battito (+ in eccesso, esclusa la fine dell'audio);
- intro: la prima sezione trovata si chiama Intro e finisce entro 1 battito da quella vera;
- pennata: % di sezioni vere con il pattern giusto (maiuscole/minuscole ignorate);
- dinamica: % di coppie di sezioni in cui l'ordine dei livelli segue quello reale.
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

RUNS = [("A", s) for s in (1, 2, 3, 4)] + [("B", s) for s in (1, 2, 3, 4)]
BPM = {1: 100, 2: 92, 3: 112, 4: 84}


def chord_at(res: dict, t: float) -> str | None:
    for c in res["chords"]:
        if c["start"] <= t < c["end"]:
            return c["symbol"]
    return None


def overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def evaluate(res: dict, truth: dict) -> dict:
    beat = 60 / truth["bpm"]
    secs = res["sections"]
    tsecs = truth["sections"]
    # accordi, battito per battito
    ok = n = 0
    ends = [b for _, _, b in tsecs]
    song_end = ends[-1]
    for i, (t, sym) in enumerate(truth["chords"]):
        for k in range(4):
            tt = t + (k + 0.5) * beat
            if tt >= song_end:
                break
            n += 1
            ok += chord_at(res, tt) == sym
    # confini
    tb = [a for _, a, _ in tsecs] + [song_end]
    fb = [s["start"] for s in secs] + [secs[-1]["end"]]
    fb = [f for f in fb if f < res["duration"] - 0.5]  # la fine dell'audio non conta
    hit = sum(any(abs(t - f) <= beat for f in fb) for t in tb)
    extra = sum(not any(abs(t - f) <= beat for t in tb) for f in fb)
    # intro
    first = secs[0]
    intro_ok = first["label"].startswith("Intro") and abs(first["end"] - tsecs[0][2]) <= beat
    # pennata e dinamica per sezione vera
    strum_ok = 0
    levels = []
    for (name, a, b), pat in zip(tsecs, truth["patterns"]):
        best = max(secs, key=lambda s: overlap(a, b, s["start"], s["end"]))
        strum_ok += best["strum"]["steps"].upper() == pat
        levels.append(best["dynamics"]["level"])
    pairs = good = 0
    for i in range(len(levels)):
        for j in range(i + 1, len(levels)):
            gi, gj = truth["gains"][i], truth["gains"][j]
            if gi == gj:
                continue
            pairs += 1
            good += (levels[i] < levels[j]) == (gi < gj) and levels[i] != levels[j]
    return {
        "bpm_err": abs(res["bpm"] - truth["bpm"]),
        "chords": ok / max(1, n),
        "bounds": (hit, len(tb), extra),
        "intro": intro_ok,
        "strum": (strum_ok, len(tsecs)),
        "dyn": (good, pairs),
    }


def main(verbose: bool) -> None:
    tot = {"chords": 0.0, "hit": 0, "nb": 0, "extra": 0, "intro": 0, "strum": 0, "ns": 0, "dg": 0, "dp": 0, "bpm": 0.0}
    with tempfile.TemporaryDirectory() as d:
        for form, seed in RUNS:
            y, truth = song(bpm=BPM[seed], seed=seed, form=form)
            p = Path(d) / f"{form}{seed}.wav"
            save_wav(p, y)
            res = analyze_file(str(p))
            e = evaluate(res, truth)
            h, nb, ex = e["bounds"]
            print(
                f"{form}{seed} {BPM[seed]:>3}bpm  tempo ±{e['bpm_err']:.1f}  accordi {e['chords']:.0%}  "
                f"confini {h}/{nb} +{ex}  intro {'sì' if e['intro'] else 'no'}  "
                f"pennata {e['strum'][0]}/{e['strum'][1]}  dinamica {e['dyn'][0]}/{e['dyn'][1]}"
            )
            if verbose:
                for s in res["sections"]:
                    print(f"     {s['label']:<14}{s['start']:>7.2f}{s['end']:>7.2f}  liv {s['dynamics']['level']}  {s['strum']['steps']}")
                print("     accordi:", " ".join(f"{c['symbol']}@{c['start']:.1f}" for c in res["chords"][:14]))
            tot["chords"] += e["chords"]
            tot["hit"] += h
            tot["nb"] += nb
            tot["extra"] += ex
            tot["intro"] += e["intro"]
            tot["strum"] += e["strum"][0]
            tot["ns"] += e["strum"][1]
            tot["dg"] += e["dyn"][0]
            tot["dp"] += e["dyn"][1]
            tot["bpm"] = max(tot["bpm"], e["bpm_err"])
    k = len(RUNS)
    print(
        f"\nTOTALE  tempo max ±{tot['bpm']:.1f}  accordi {tot['chords'] / k:.0%}  confini {tot['hit']}/{tot['nb']} +{tot['extra']}  "
        f"intro {tot['intro']}/{k}  pennata {tot['strum']}/{tot['ns']}  dinamica {tot['dg']}/{tot['dp']}"
    )


if __name__ == "__main__":
    main("-v" in sys.argv)
