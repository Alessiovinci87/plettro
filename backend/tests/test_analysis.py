"""Test dell'analisi su brani sintetici con risposta nota.

Esegui dalla cartella backend:  python -m unittest -v
"""
from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path

import numpy as np

from app.analysis import advice, harmony
from app.analysis.audio_io import save_wav
from app.analysis.pipeline import analyze_file
from app.jobs import JobStore
from tests.synth import song

os.environ.setdefault("PLETTRO_DISABLE_DEMUCS", "1")


def chord_at(result: dict, t: float) -> str | None:
    for c in result["chords"]:
        if c["start"] <= t < c["end"]:
            return c["symbol"]
    return None


class SongCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        y, cls.truth = song(bass_on=True, drums_on=True)
        p = Path(cls.tmp.name) / "mix.wav"
        save_wav(p, y)
        cls.mix = analyze_file(str(p))
        g, _ = song(bass_on=False, drums_on=False)
        p2 = Path(cls.tmp.name) / "gtr.wav"
        save_wav(p2, g)
        cls.gtr = analyze_file(str(p2))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_tempo_and_meter(self):
        self.assertAlmostEqual(self.mix["bpm"], 100, delta=2)
        self.assertEqual(self.mix["meter"], 4)
        # il primo "uno" cade sull'inizio reale del brano
        self.assertAlmostEqual(self.mix["downbeats"][0], 0.5, delta=0.08)

    def test_key(self):
        self.assertIn(self.mix["key"]["name"], ("G", "Em"))

    def test_chords_clean_sections(self):
        clean = [(t, c) for t, c in self.truth["chords"] if t < 29 or 48.5 <= t < 67.7]
        beat = 0.6
        hits = sum(chord_at(self.mix, t + 2 * beat) == c for t, c in clean)
        self.assertGreaterEqual(hits / len(clean), 0.7, f"accordi giusti {hits}/{len(clean)}")

    def test_sections(self):
        labels = [s["label"] for s in self.mix["sections"]]
        self.assertGreaterEqual(len(labels), 4)
        self.assertTrue(labels[0].startswith("Intro"), labels)
        loud = max(self.mix["sections"], key=lambda s: s["energy"])
        self.assertTrue(loud["label"].startswith("Ritornello"), labels)

    def test_strum_pattern_on_guitar(self):
        verse = next(s for s in self.gtr["sections"] if s["start"] > 9 and s["end"] < 30)
        self.assertEqual(verse["strum"]["steps"].upper(), "D---D-U---U-D-U-")
        intro = self.gtr["sections"][0]
        self.assertEqual(intro["strum"]["steps"].upper(), "D---D---D---D---")

    def test_tone(self):
        secs = self.mix["sections"]
        verse = next(s for s in secs if s["start"] > 9 and s["end"] < 30)
        chorus = next(s for s in secs if s["start"] > 28 and s["end"] < 50)
        self.assertEqual(verse["tone"]["gain"], "pulito")
        self.assertIn(chorus["tone"]["gain"], ("crunch", "drive", "high gain"))
        self.assertGreater(chorus["dynamics"]["level"], verse["dynamics"]["level"] - 1)
        self.assertTrue(any(e["block"] == "Ampli" for e in chorus["effects"]))

    def test_result_shape(self):
        r = self.mix
        for k in ("bpm", "key", "sections", "chords", "capo", "tuning", "melody", "separation", "warnings"):
            self.assertIn(k, r)
        s = r["sections"][0]
        for k in ("label", "chart", "strum", "tone", "effects", "dynamics", "presets"):
            self.assertIn(k, s)


class TempoCase(unittest.TestCase):
    def test_tempo_range(self):
        with tempfile.TemporaryDirectory() as d:
            for bpm in (72, 128, 150):
                y, _ = song(bpm=bpm, seed=3)
                p = Path(d) / f"s{bpm}.wav"
                save_wav(p, y)
                r = analyze_file(str(p))
                self.assertAlmostEqual(r["bpm"], bpm, delta=1.5)
                self.assertAlmostEqual(r["downbeats"][0], 0.5, delta=0.08)


class AdviceCase(unittest.TestCase):
    def test_capo(self):
        seq = [(8, "major"), (3, "major"), (5, "minor"), (1, "major")]  # Ab Eb Fm Db
        chords = [harmony.ChordSeg(r, q, i * 2.0, i * 2.0 + 2, 4) for i, (r, q) in enumerate(seq * 2)]
        c = advice.suggest_capo(chords)
        self.assertEqual(c["fret"], 1)
        self.assertEqual([s["play"] for s in c["shapes"]], ["G", "D", "Em", "C"])

    def test_tuning_eb(self):
        key = harmony.Key(tonic=3, mode="major", confidence=0.8)
        chords = [harmony.ChordSeg(r, "major", 0, 1, 4) for r in (3, 8, 10)]
        self.assertEqual(advice.suggest_tuning(key, chords, None, False)["id"], "eb")


class JobsCase(unittest.TestCase):
    def test_job_lifecycle_and_cleanup(self):
        store = JobStore()
        fd, tmp = tempfile.mkstemp()
        os.close(fd)

        def fake(path, progress):
            progress(0.5, "metà")
            return {"ok": path}

        job = store.submit(Path(tmp), "x.wav", fake)
        for _ in range(50):
            if store.get(job.id).status == "completato":
                break
            time.sleep(0.05)
        self.assertEqual(store.get(job.id).status, "completato")
        self.assertFalse(os.path.exists(tmp), "il file caricato deve essere cancellato")

    def test_job_error_message(self):
        store = JobStore()
        fd, tmp = tempfile.mkstemp()
        os.close(fd)

        def boom(path, progress):
            raise ValueError("Il brano è troppo corto")

        job = store.submit(Path(tmp), "x.wav", boom)
        for _ in range(50):
            if store.get(job.id).status == "errore":
                break
            time.sleep(0.05)
        self.assertEqual(store.get(job.id).error, "Il brano è troppo corto")


try:
    from fastapi.testclient import TestClient

    HAVE_FASTAPI = True
except (ImportError, RuntimeError):  # starlette lancia RuntimeError se manca httpx2
    HAVE_FASTAPI = False


@unittest.skipUnless(HAVE_FASTAPI, "fastapi non installato")
class ApiCase(unittest.TestCase):
    def test_upload_and_poll(self):
        from app.main import app

        client = TestClient(app)
        self.assertEqual(client.get("/health").json()["status"], "ok")
        y, _ = song()
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "brano.wav"
            save_wav(p, y)
            r = client.post("/analyze", files={"file": ("brano.wav", p.read_bytes(), "audio/wav")})
        self.assertEqual(r.status_code, 202)
        jid = r.json()["job_id"]
        for _ in range(300):
            st = client.get(f"/jobs/{jid}").json()
            if st["status"] in ("completato", "errore"):
                break
            time.sleep(0.2)
        self.assertEqual(st["status"], "completato", st.get("error"))
        self.assertAlmostEqual(st["result"]["bpm"], 100, delta=2)
        bad = client.post("/analyze", files={"file": ("x.txt", b"ciao", "text/plain")})
        self.assertEqual(bad.status_code, 415)


if __name__ == "__main__":
    unittest.main()
