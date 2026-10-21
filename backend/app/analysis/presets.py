"""Aggancio ai preset: interfaccia unica, oggi con regole interne, domani con PresetDock.

Contratto PresetDock (da implementare lato PresetDock quando si uniscono i progetti):

    POST {PRESETDOCK_URL}/api/match
    {
      "descriptor": {"gain": "crunch", "brightness": "brillante", "ambience": "medio",
                     "delay": "ottavo puntato" | null, "compression": "naturale",
                     "bpm": 120, "key": "Am", "section": "Ritornello 1"},
      "limit": 3
    }
    → {"presets": [{"id": "...", "name": "...", "author": "...", "score": 0.0-1.0,
                    "snapshot": "...", "url": "..."}]}

Se PRESETDOCK_URL non è impostata, o PresetDock non risponde, si usa il matcher a regole.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from typing import Protocol

log = logging.getLogger(__name__)


class PresetMatcher(Protocol):
    name: str

    def match(self, descriptor: dict, limit: int = 3) -> list[dict]: ...


class RulesMatcher:
    """Nessun archivio: restituisce una descrizione testuale del preset da cercare."""

    name = "regole"

    def match(self, descriptor: dict, limit: int = 3) -> list[dict]:
        words = [descriptor.get("gain", ""), descriptor.get("brightness", ""), f"riverbero {descriptor.get('ambience', '')}"]
        if descriptor.get("delay"):
            words.append(f"delay {descriptor['delay']}")
        return [
            {
                "id": None,
                "name": "Cerca in PresetDock: " + ", ".join(w for w in words if w),
                "author": None,
                "score": None,
                "query": " ".join(w for w in words if w),
            }
        ]


class PresetDockMatcher:
    name = "presetdock"

    def __init__(self, url: str, timeout: float = 4.0):
        self.url = url.rstrip("/")
        self.timeout = timeout

    def match(self, descriptor: dict, limit: int = 3) -> list[dict]:
        body = json.dumps({"descriptor": descriptor, "limit": limit}).encode()
        req = urllib.request.Request(f"{self.url}/api/match", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:  # noqa: S310 - URL configurata dall'utente
            data = json.loads(r.read())
        return list(data.get("presets", []))[:limit]


class FallbackMatcher:
    def __init__(self, primary: PresetMatcher, fallback: PresetMatcher):
        self.primary, self.fallback = primary, fallback
        self.name = primary.name

    def match(self, descriptor: dict, limit: int = 3) -> list[dict]:
        try:
            res = self.primary.match(descriptor, limit)
            if res:
                return res
        except Exception as exc:
            log.warning("PresetDock non raggiungibile (%s): uso le regole", exc)
        return self.fallback.match(descriptor, limit)


def get_matcher() -> PresetMatcher:
    url = os.environ.get("PRESETDOCK_URL")
    if url:
        return FallbackMatcher(PresetDockMatcher(url), RulesMatcher())
    return RulesMatcher()
