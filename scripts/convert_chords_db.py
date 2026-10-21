"""Converte guitar.json di chords-db (MIT, github.com/tombatossals/chords-db)
nel formato compatto usato da Plettro: tasti assoluti, dita, barrè.

Uso: python scripts/convert_chords_db.py path/to/chords-db/lib/guitar.json
"""
import json
import sys
from pathlib import Path

KEY_FIX = {"Csharp": "C#", "Fsharp": "F#"}


def convert(src: Path) -> dict:
    db = json.loads(src.read_text())
    out = {}
    for key, entries in db["chords"].items():
        key = KEY_FIX.get(key, key)
        for e in entries:
            shapes = []
            for p in e["positions"]:
                base = p.get("baseFret", 1)
                frets = [f if f <= 0 else f + base - 1 for f in p["frets"]]
                barres = [b + base - 1 for b in p.get("barres", [])]
                shapes.append({"f": frets, "d": p["fingers"], "b": barres})
            out.setdefault(key, {})[e["suffix"]] = shapes
    return out


if __name__ == "__main__":
    src = Path(sys.argv[1])
    dst = Path(__file__).resolve().parents[1] / "frontend/src/data/chords-standard.json"
    data = convert(src)
    dst.write_text(json.dumps(data, separators=(",", ":")))
    n = sum(len(v) for k in data.values() for v in k.values())
    print(f"{n} diteggiature scritte in {dst}")
