"""Isolamento della chitarra.

Se è installato Demucs (pip install demucs) si usa il modello a 6 sorgenti
`htdemucs_6s`, che ha una traccia "guitar" dedicata. Altrimenti si ripiega su
una stima leggera: componente armonica (HPSS) nella banda della chitarra.
La qualità del ripiego è inferiore e viene segnalata nel risultato.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import numpy as np

from .dsp import SR, bandpass

log = logging.getLogger(__name__)


@dataclass
class Stems:
    guitar: np.ndarray
    mix: np.ndarray
    method: str  # "demucs" | "stima"
    note: str


def separate(y: np.ndarray, sr: int = SR) -> Stems:
    if os.environ.get("PLETTRO_DISABLE_DEMUCS") != "1":
        try:
            g = _demucs_guitar(y, sr)
            if g is not None:
                return Stems(g, y, "demucs", "Chitarra isolata con Demucs (htdemucs_6s).")
        except Exception as exc:  # pragma: no cover - dipende da torch/demucs
            log.warning("Demucs non disponibile o fallito: %s", exc)
    return Stems(_light_guitar(y, sr), y, "stima", "Chitarra stimata senza separazione: installa Demucs per risultati migliori.")


def _light_guitar(y: np.ndarray, sr: int) -> np.ndarray:
    """Banda 80 Hz – 6 kHz: toglie gran parte di cassa, basso profondo e piatti."""
    return bandpass(y, 80, 6000, sr).astype(np.float32)


def _demucs_guitar(y: np.ndarray, sr: int) -> np.ndarray | None:  # pragma: no cover
    try:
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
    except ImportError:
        return None
    from scipy.signal import resample_poly

    model = get_model("htdemucs_6s")
    model.eval()
    target = model.samplerate  # 44100
    x = resample_poly(y, target, sr).astype(np.float32)
    wav = torch.from_numpy(np.stack([x, x]))[None]  # (1, 2, n)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    with torch.no_grad():
        out = apply_model(model, wav, device=device, split=True, overlap=0.25, progress=False)[0]
    idx = model.sources.index("guitar")
    g = out[idx].mean(0).cpu().numpy()
    return resample_poly(g, sr, target).astype(np.float32)[: len(y)]
