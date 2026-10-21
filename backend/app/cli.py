"""Analisi da riga di comando, utile per lavorarci in VS Code senza avviare l'API.

    python -m app.cli percorso/brano.mp3 > risultato.json
"""
from __future__ import annotations

import json
import sys

from .analysis.pipeline import analyze_file


def main() -> None:
    if len(sys.argv) != 2:
        print("Uso: python -m app.cli <file audio>", file=sys.stderr)
        sys.exit(2)
    res = analyze_file(sys.argv[1], lambda p, m: print(f"[{p:4.0%}] {m}", file=sys.stderr))
    json.dump(res, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
