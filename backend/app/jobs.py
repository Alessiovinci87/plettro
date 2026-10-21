"""Coda di analisi in memoria: un thread di lavoro, avanzamento consultabile."""
from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

log = logging.getLogger(__name__)


@dataclass
class Job:
    id: str
    filename: str
    status: str = "in coda"  # in coda | in corso | completato | errore
    progress: float = 0.0
    step: str = "In attesa"
    result: dict | None = None
    error: str | None = None
    created: float = field(default_factory=time.time)

    def public(self) -> dict:
        return {
            "id": self.id,
            "filename": self.filename,
            "status": self.status,
            "progress": round(self.progress, 3),
            "step": self.step,
            "error": self.error,
            "result": self.result,
        }


class JobStore:
    def __init__(self, workers: int = 1, ttl_seconds: int = 3600):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="analisi")
        self.ttl = ttl_seconds

    def submit(self, path: Path, filename: str, fn: Callable[[str, Callable[[float, str], None]], dict]) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], filename=filename)
        with self._lock:
            self._purge()
            self._jobs[job.id] = job

        def progress(p: float, step: str) -> None:
            job.progress = p
            job.step = step

        def run() -> None:
            job.status = "in corso"
            try:
                job.result = fn(str(path), progress)
                job.status = "completato"
            except Exception as exc:  # l'errore va mostrato all'utente
                log.exception("Analisi fallita")
                job.status = "errore"
                job.error = str(exc) or exc.__class__.__name__
            finally:
                # il brano caricato non viene conservato
                try:
                    os.unlink(path)
                except OSError:
                    pass

        self._pool.submit(run)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def _purge(self) -> None:
        now = time.time()
        for k in [k for k, j in self._jobs.items() if now - j.created > self.ttl]:
            del self._jobs[k]
