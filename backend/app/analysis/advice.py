"""Consigli pratici: capotasto e accordatura."""
from __future__ import annotations

from .harmony import CHORD_QUALITIES, NAMES, ChordSeg, Key

# Forme "aperte" comode in accordatura standard (fondamentale, qualità)
_C, _D, _E, _G, _A, _B = 0, 2, 4, 7, 9, 11
OPEN_SHAPES = {
    (_C, "major"), (_A, "major"), (_G, "major"), (_E, "major"), (_D, "major"),
    (_A, "minor"), (_E, "minor"), (_D, "minor"),
    (_A, "7"), (_E, "7"), (_D, "7"), (_G, "7"), (_C, "7"), (_B, "7"),
    (_A, "m7"), (_E, "m7"), (_D, "m7"),
    (_C, "maj7"), (_A, "maj7"), (_D, "maj7"), (_G, "maj7"),
    (_A, "sus4"), (_D, "sus4"), (_E, "sus4"), (_A, "sus2"), (_D, "sus2"),
    (_E, "5"), (_A, "5"), (_D, "5"),
}


def _sym(root: int, q: str) -> str:
    return NAMES[root % 12] + CHORD_QUALITIES[q][1]


def suggest_capo(chords: list[ChordSeg]) -> dict:
    total = sum(c.end - c.start for c in chords) or 1.0
    best = None
    for capo in range(0, 8):
        easy = sum(c.end - c.start for c in chords if ((c.root - capo) % 12, c.quality) in OPEN_SHAPES)
        score = easy / total - capo * 0.015
        if best is None or score > best[1]:
            best = (capo, score, easy / total)
    base_easy = sum(c.end - c.start for c in chords if (c.root, c.quality) in OPEN_SHAPES) / total
    capo, _, share = best
    uniq = []
    for c in chords:
        s = (_sym(c.root, c.quality), _sym(c.root - capo, c.quality))
        if s not in uniq:
            uniq.append(s)
    if capo == 0 or share - base_easy < 0.2:
        return {
            "fret": 0,
            "easy_share": round(base_easy, 2),
            "reason": "Senza capotasto le forme sono già comode." if base_easy > 0.6 else "Il capotasto non semplifica molto: servono comunque barrè.",
            "shapes": [{"sounds": a, "play": a} for a, _ in uniq[:12]],
        }
    return {
        "fret": capo,
        "easy_share": round(share, 2),
        "reason": f"Con il capotasto al {capo}º tasto il {round(share * 100)}% del brano si suona con forme aperte.",
        "shapes": [{"sounds": a, "play": b} for a, b in uniq[:12]],
    }


def suggest_tuning(key: Key, chords: list[ChordSeg], low_note_midi: float | None, separated: bool) -> dict:
    flats = {3, 8, 10, 1, 6}  # Eb, Ab, Bb, Db, Gb
    roots = [c.root for c in chords]
    share_flat = sum(1 for r in roots if r in flats) / max(1, len(roots))
    if separated and low_note_midi is not None and low_note_midi < 39.5:
        semis = round(40 - low_note_midi)
        if semis == 2:
            return {"id": "drop-d", "name": "Drop D", "reason": "La chitarra scende sotto il Mi basso fino al Re: probabile Drop D."}
        if semis == 1:
            return {"id": "eb", "name": "Mezzo tono sotto (Eb)", "reason": "La nota più grave è un Mib: chitarra accordata mezzo tono sotto."}
        return {"id": "d-std", "name": "Accordatura ribassata", "reason": f"La nota più grave è circa {semis} semitoni sotto il Mi: accordatura ribassata."}
    if key.tonic in (3, 8, 10, 1) and share_flat > 0.5:
        return {
            "id": "eb",
            "name": "Mezzo tono sotto (Eb)",
            "reason": f"Brano in {key.label_it()}: con le corde mezzo tono sotto suoni le stesse forme di {NAMES[(key.tonic + 1) % 12]}, senza barrè.",
        }
    if key.tonic == 2:
        return {"id": "drop-d", "name": "Drop D (opzionale)", "reason": "Brano in Re: il Re basso a vuoto in Drop D dà più corpo."}
    return {"id": "standard", "name": "Standard", "reason": "L'accordatura standard va benissimo per questo brano."}
