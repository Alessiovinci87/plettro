"""Analisi completa di un brano: dal file audio ai consigli per suonarlo."""
from __future__ import annotations

import time
from typing import Callable

import numpy as np

from . import advice, harmony, melody, rhythm, strumming, structure, tone
from .audio_io import load
from .dsp import SR, Spec, chroma, hpss_masks, normalize_cols, rms_db, stft, sync
from .presets import get_matcher
from .separation import separate

Progress = Callable[[float, str], None]


def _noop(_: float, __: str) -> None:
    pass


def _low_note(spec: Spec) -> float | None:
    """Nota più grave suonata con continuità dalla chitarra (solo con traccia separata)."""
    m = spec.mag.mean(axis=1)
    energies = []
    for midi in range(34, 53):
        f0 = 440 * 2 ** ((midi - 69) / 12)
        j = int(round(f0 / (spec.freqs[1] - spec.freqs[0])))
        # fondamentale + seconda armonica
        e = m[max(0, j - 1) : j + 2].max() + 0.5 * m[max(0, 2 * j - 1) : 2 * j + 2].max()
        energies.append((midi, e))
    top = max(e for _, e in energies) or 1.0
    for midi, e in energies:
        if e > 0.45 * top:
            return float(midi)
    return None


def analyze_file(path: str, progress: Progress = _noop) -> dict:
    t_start = time.time()
    progress(0.02, "Lettura del file")
    y = load(path)
    duration = len(y) / SR

    progress(0.08, "Isolamento della chitarra")
    stems = separate(y)

    progress(0.25, "Tempo e battiti")
    spec = stft(y, n_fft=2048, hop=512)
    _, pmask = hpss_masks(spec.mag)
    perc = Spec(spec.mag * pmask, spec.freqs, spec.hop, spec.sr)
    low = spec.mag[spec.band(40, 150)].sum(axis=0)
    rh = rhythm.analyze_rhythm(perc, low)
    beats = rh.beats
    if len(beats) < 8:
        raise ValueError("Non riesco a trovare un tempo regolare in questo brano.")

    progress(0.4, "Tonalità e accordi")
    spec_h = stft(y, n_fft=4096, hop=512)
    times = spec_h.times()
    ch = chroma(spec_h)
    bass = chroma(spec_h, lo=28, hi=52, weights=(1.0, 0.5))
    bounds = np.append(beats, beats[-1] + rh.beat_period)
    beat_ch = normalize_cols(sync(ch, times, bounds))
    beat_bass = sync(bass, times, bounds)
    frame_e = spec_h.mag.sum(axis=0)
    beat_e = sync(frame_e[None, :], times, bounds, agg=np.mean)[0]
    change = np.r_[0.0, 1 - np.sum(beat_ch[:, 1:] * beat_ch[:, :-1], axis=0)]
    rh = rhythm.refine_meter(rh, low, change)
    key = harmony.estimate_key(ch.mean(axis=1))
    beat_in_bar = (np.arange(len(beats)) - rh.downbeat_index) % rh.meter
    chords = harmony.recognize_chords(beat_ch, beat_bass, beat_e, bounds, key, beat_in_bar, rh.meter)

    progress(0.55, "Struttura del brano")
    db = rh.downbeat_index
    bar_starts = beats[db :: rh.meter]
    if len(bar_starts) < 2:
        bar_starts = beats[:: rh.meter]
    bar_bounds = np.append(bar_starts, bar_starts[-1] + rh.beat_period * rh.meter)
    bar_ch = normalize_cols(sync(ch, times, bar_bounds, agg=np.mean))
    bar_e = sync(frame_e[None, :], times, bar_bounds, agg=np.mean)[0]
    bar_e_db = 20 * np.log10(bar_e / (bar_e.max() + 1e-9) + 1e-6)
    # attacchi della chitarra: servono per il ritmo di ogni battuta e per la pennata
    g_fine = stft(stems.guitar, n_fft=1024, hop=128)
    g_env = strumming.guitar_onsets(g_fine)
    n_bars = len(bar_bounds) - 1
    bar_rhythm = strumming.bar_profiles(g_env, g_fine.fps, beats, db, rh.meter, n_bars)
    feat = structure.bar_features(bar_ch, bar_rhythm, bar_e_db)
    sections = structure.segment(feat, bar_bounds, bar_e_db, bar_ch, bar_rhythm)

    progress(0.65, "Pennata, dinamica e suono")
    g_spec = stft(stems.guitar, n_fft=2048, hop=512)
    g_env_coarse = strumming.guitar_onsets(g_spec)
    matcher = get_matcher()
    out_sections = []
    prev_level = None
    levels = _levels(y, [(s.start, s.end) for s in sections])
    for s, level in zip(sections, levels):
        first_beat = db + s.start_bar * rh.meter
        n_beats = (s.end_bar - s.start_bar) * rh.meter
        tp = tone.profile(g_spec, g_env_coarse, s.start, s.end, rh.beat_period)
        st = strumming.analyze_section(g_env, g_fine.fps, beats, first_beat, n_beats, rh.meter, tp.hf_ratio, tp.decay_db_s)
        sec_chords = [c for c in chords if c.end > s.start + 0.05 and c.start < s.end - 0.05]
        descriptor = {
            "gain": tp.gain, "brightness": tp.brightness, "ambience": tp.ambience, "delay": tp.delay,
            "compression": tp.compression, "bpm": round(rh.bpm), "key": key.name, "section": s.label,
        }
        out_sections.append(
            {
                "label": s.label,
                "group": s.group,
                "start": round(s.start, 2),
                "end": round(min(s.end, duration), 2),
                "bars": s.end_bar - s.start_bar,
                "energy": round(s.energy, 2),
                "dynamics": {"level": level, "advice": tone.dynamics_advice(level, prev_level)},
                "chords": [c.to_dict() for c in sec_chords],
                "chart": _chart(sec_chords, bar_bounds[s.start_bar : s.end_bar + 1]),
                "strum": st.to_dict(),
                "tone": tp.to_dict(),
                "effects": tone.effect_chain(tp, rh.bpm),
                "presets": matcher.match(descriptor),
            }
        )
        prev_level = level

    progress(0.85, "Melodia")
    mel_src = stft(stems.guitar if stems.method == "demucs" else y, n_fft=4096, hop=512)
    mel = melody.melody(mel_src)

    progress(0.95, "Consigli finali")
    low_note = _low_note(mel_src) if stems.method == "demucs" else None
    result = {
        "version": 1,
        "duration": round(duration, 2),
        "bpm": round(rh.bpm, 1),
        "bpm_confidence": round(rh.confidence, 2),
        "bpm_alternatives": [round(rh.bpm / 2, 1), round(rh.bpm * 2, 1)],
        "meter": rh.meter,
        "time_signature": f"{rh.meter}/4",
        "key": {"tonic": key.tonic, "mode": key.mode, "name": key.name, "label": key.label_it(), "confidence": round(key.confidence, 2)},
        "separation": {"method": stems.method, "note": stems.note},
        "preset_source": matcher.name,
        "beats": [round(float(b), 3) for b in beats],
        "downbeats": [round(float(b), 3) for b in bar_starts],
        "chords": [c.to_dict() for c in chords],
        "sections": out_sections,
        "melody": mel,
        "capo": advice.suggest_capo(chords),
        "tuning": advice.suggest_tuning(key, chords, low_note, stems.method == "demucs"),
        "warnings": _warnings(rh, key, stems.method),
        "elapsed": round(time.time() - t_start, 1),
    }
    progress(1.0, "Fatto")
    return result


DB_PER_LEVEL = 3.0  # ogni 3 dB sotto la sezione più forte si scende di un livello


def _levels(y: np.ndarray, spans: list[tuple[float, float]], hop: int = 512) -> list[int]:
    """Intensità 1-5 di ogni sezione rispetto alla più forte del brano (5 = la più forte).

    Si usa il volume medio in dB: la strofa di solito sta 3-6 dB sotto il ritornello.
    """
    e = np.maximum(rms_db(y, 2048, hop), -80.0)
    fps = SR / hop
    loud = []
    for a, b in spans:
        seg = e[int(a * fps) : max(int(a * fps) + 1, int(b * fps))]
        loud.append(float(np.mean(seg)) if seg.size else -80.0)
    top = max(loud) if loud else 0.0
    return [int(np.clip(5 + round((x - top) / DB_PER_LEVEL), 1, 5)) for x in loud]


def _chart(chs: list[harmony.ChordSeg], bar_bounds: np.ndarray) -> list[list[str]]:
    bars = []
    for a, b in zip(bar_bounds[:-1], bar_bounds[1:]):
        inside = []
        for c in chs:
            overlap = min(c.end, b) - max(c.start, a)
            if overlap > (b - a) * 0.2 and c.symbol not in inside:
                inside.append(c.symbol)
        bars.append(inside or ["–"])
    return bars


def _warnings(rh: rhythm.Rhythm, key: harmony.Key, method: str) -> list[str]:
    w = []
    if method != "demucs":
        w.append("Analisi senza separazione delle tracce: pennata ed effetti sono stimati sul mix completo.")
    if rh.confidence < 0.3:
        w.append("Tempo poco regolare o rubato: battiti e misure potrebbero essere imprecisi.")
    if key.confidence < 0.25:
        w.append("Tonalità incerta (brano modale o con molte modulazioni).")
    return w
