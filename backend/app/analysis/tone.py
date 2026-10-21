"""Profilo del suono della chitarra e suggerimenti di effetti.

Stime indicative (non una ricostruzione esatta della catena):
- gain/distorsione: piattezza spettrale e peso delle armoniche alte;
- brillantezza: baricentro spettrale;
- ambiente (riverbero): velocità con cui decade l'energia dopo gli attacchi;
- delay: eco ricorrenti a frazioni di battito (es. ottavo puntato);
- compressione: escursione dinamica a breve termine.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .dsp import Spec


@dataclass
class ToneProfile:
    gain: str  # pulito | crunch | drive | high gain
    gain_score: float
    brightness: str  # scuro | bilanciato | brillante
    centroid_hz: float
    ambience: str  # secco | medio | ampio
    decay_db_s: float
    delay: str | None  # "ottavo puntato" | "ottavo" | "semiminima" | None
    delay_ms: float | None
    compression: str  # naturale | compresso
    hf_ratio: float

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("gain_score", "centroid_hz", "decay_db_s", "hf_ratio"):
            d[k] = round(float(d[k]), 3)
        if d["delay_ms"] is not None:
            d["delay_ms"] = round(d["delay_ms"])
        return d


def profile(spec: Spec, env: np.ndarray, t0: float, t1: float, beat_period: float) -> ToneProfile:
    a, b = int(t0 * spec.fps), max(int(t0 * spec.fps) + 1, int(t1 * spec.fps))
    mag = spec.mag[:, a:b]
    f = spec.freqs
    power = mag**2 + 1e-12
    frame_e = power.sum(axis=0)
    active = frame_e > np.percentile(frame_e, 40)
    if active.sum() < 4:
        active = np.ones_like(frame_e, dtype=bool)
    p = power[:, active]

    centroid = float((f[:, None] * p).sum(axis=0).mean() / p.sum(axis=0).mean())
    band_hi = (f >= 2000) & (f < 6000)
    band_mid = (f >= 200) & (f < 1000)
    hf_ratio = float(p[band_hi].sum() / (p[band_mid].sum() + 1e-12))
    sel = (f >= 1000) & (f < 5000)
    flat = np.exp(np.mean(np.log(p[sel]), axis=0)) / np.mean(p[sel], axis=0)
    flatness = float(np.median(flat))
    gain_score = float(np.clip(0.6 * np.clip((flatness - 0.02) / 0.25, 0, 1) + 0.4 * np.clip((hf_ratio - 0.05) / 0.6, 0, 1), 0, 1))
    gain = "pulito" if gain_score < 0.34 else "crunch" if gain_score < 0.5 else "drive" if gain_score < 0.72 else "high gain"
    brightness = "scuro" if centroid < 1100 else "bilanciato" if centroid < 2200 else "brillante"

    # decadimento dopo gli attacchi, misurato sulle alte (3-8 kHz): la corda lì si spegne
    # in fretta, quindi una coda lunga indica riverbero più che sustain
    hf = power[(f >= 3000) & (f < 8000)].sum(axis=0) + 1e-12
    e_db = 10 * np.log10(hf / hf.max())
    seg_env = env[a:b]
    peaks = [i for i in range(1, len(seg_env) - 1) if seg_env[i] > seg_env[i - 1] and seg_env[i] >= seg_env[i + 1] and seg_env[i] > 0.5 * seg_env.max()]
    slopes = []
    w = int(0.25 * spec.fps)
    for pk in peaks:
        if pk + w < len(e_db):
            seg = e_db[pk : pk + w]
            top = int(np.argmax(seg[: max(2, w // 4)]))
            drop = seg[top] - seg[-1]
            slopes.append(drop / ((w - top) / spec.fps))
    decay = float(np.median(slopes)) if slopes else 30.0
    ambience = "ampio" if decay < 18 else "medio" if decay < 40 else "secco"

    # delay: autocorrelazione dell'inviluppo a frazioni del battito
    delay, delay_ms = None, None
    if len(seg_env) > spec.fps * 4:
        x = seg_env - seg_env.mean()
        ac = np.correlate(x, x, mode="full")[len(x) - 1 :]
        ac /= ac[0] + 1e-9

        def at(frac: float) -> float:
            lag = frac * beat_period * spec.fps
            i = int(round(lag))
            return float(ac[max(0, i - 1) : i + 2].max()) if i + 2 < len(ac) else 0.0

        dotted, half, quarter = at(0.75), at(0.5), at(1.0)
        if dotted > 0.25 and dotted > 0.8 * half and dotted > 0.6 * quarter:
            delay, delay_ms = "ottavo puntato", 750 * beat_period
    full_db = 10 * np.log10(frame_e / frame_e.max())
    dyn = np.percentile(full_db[active], 90) - np.percentile(full_db[active], 20)
    compression = "compresso" if dyn < 6 else "naturale"
    return ToneProfile(gain, gain_score, brightness, centroid, ambience, decay, delay, delay_ms, compression, hf_ratio)


# ---------------------------------------------------------------------------
# Suggerimenti di catena (nomi dei modelli Line 6 Helix tra parentesi)

AMPS = {
    "pulito": ("Ampli pulito americano", "US Deluxe Nrm", {"Drive": 3, "Bass": 5, "Mid": 5, "Treble": 6}),
    "crunch": ("Ampli britannico a canale crunch", "Brit Plexi Brt", {"Drive": 5, "Bass": 5, "Mid": 6, "Treble": 6}),
    "drive": ("Ampli britannico ad alto guadagno", "Brit 2204", {"Drive": 6, "Bass": 5, "Mid": 6, "Treble": 6}),
    "high gain": ("Ampli high gain moderno", "Cali Rectifire", {"Drive": 6, "Bass": 6, "Mid": 4, "Treble": 6}),
}


def effect_chain(t: ToneProfile, bpm: float) -> list[dict]:
    chain: list[dict] = []
    if t.compression == "compresso" and t.gain in ("pulito", "crunch"):
        chain.append({"block": "Compressore", "model": "Deluxe Comp", "settings": {"Threshold": "-20 dB", "Ratio": "4:1", "Mix": "70%"}, "why": "Dinamica molto uniforme: suono compresso."})
    if t.gain == "drive":
        chain.append({"block": "Overdrive", "model": "Scream 808", "settings": {"Gain": 3, "Tone": 5, "Level": 7}, "why": "Spinge l'ampli verso una saturazione compatta."})
    elif t.gain == "crunch":
        chain.append({"block": "Boost (opzionale)", "model": "Minotaur", "settings": {"Gain": 2, "Treble": 5, "Output": 6}, "why": "Leggera spinta per il crunch."})
    name, model, settings = AMPS[t.gain]
    eq = {"scuro": "Treble basso (4) e Presence bassa", "bilanciato": "EQ neutra", "brillante": "Treble e Presence alti (7)"}[t.brightness]
    chain.append({"block": "Ampli", "model": model, "settings": settings, "why": f"{name}: guadagno stimato {t.gain}. {eq}."})
    if t.delay:
        ms = t.delay_ms or 750 * 60 / bpm
        chain.append({"block": "Delay", "model": "Simple Delay", "settings": {"Time": f"{round(ms)} ms (ottavo puntato a {round(bpm)} bpm)", "Feedback": "25%", "Mix": "30%"}, "why": "Eco ricorrenti a 3/4 di battito."})
    if t.ambience == "ampio":
        chain.append({"block": "Riverbero", "model": "Hall", "settings": {"Decay": "3,5 s", "Mix": "30%"}, "why": "Coda lunga dopo le pennate."})
    elif t.ambience == "medio":
        chain.append({"block": "Riverbero", "model": "Plate", "settings": {"Decay": "1,8 s", "Mix": "20%"}, "why": "Ambiente presente ma non invadente."})
    else:
        chain.append({"block": "Riverbero", "model": "Room", "settings": {"Decay": "0,8 s", "Mix": "12%"}, "why": "Suono asciutto e vicino."})
    return chain


def dynamics_advice(level: int, prev_level: int | None) -> str:
    base = {
        1: "Sussurrato: tocco leggero, solo corde acute o arpeggio.",
        2: "Morbido: pennata leggera, plettro inclinato.",
        3: "Medio: pennata piena ma controllata.",
        4: "Spinto: pennata decisa su tutte le corde.",
        5: "Al massimo: attacca forte, accenti marcati, lascia suonare.",
    }[level]
    if prev_level is not None:
        if level - prev_level >= 2:
            base += " Qui il brano si apre: entra con decisione."
        elif prev_level - level >= 2:
            base += " Qui il brano cala: alleggerisci subito la mano."
    return base
