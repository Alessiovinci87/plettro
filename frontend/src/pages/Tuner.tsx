import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store';
import { detectPitch, Smoother } from '../music/pitch';
import { freqToMidi, midiName, midiToFreq, pcName } from '../music/theory';
import { audio, referenceTone } from '../audio/engine';

interface Reading {
  freq: number;
  target: number; // midi di riferimento
  cents: number;
}

const DOTS = 21; // da -50 a +50 cent, 5 cent per pallino

export function Tuner() {
  const { tuning, tuningMidi, a4, notation, set } = useSettings();
  const [mode, setMode] = useState<'corde' | 'cromatico'>('corde');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [locked, setLocked] = useState(false);
  const stop = useRef<() => void>(() => {});
  const inTuneSince = useRef<number | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cfg = useRef({ tuningMidi, a4 });
  cfg.current = { tuningMidi, a4 };

  useEffect(() => () => stop.current(), []);

  async function start() {
    setError(null);
    try {
      const ctx = audio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const src = ctx.createMediaStreamSource(stream);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 50;
      const an = ctx.createAnalyser();
      an.fftSize = 4096;
      src.connect(hp).connect(an);
      const buf = new Float32Array(an.fftSize);
      const sm = new Smoother(7);
      let raf = 0;
      let frame = 0;
      let silent = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (frame++ % 2) return;
        an.getFloatTimeDomainData(buf);
        const p = detectPitch(buf, ctx.sampleRate, { minFreq: 55, maxFreq: 1200 });
        if (!p || p.clarity < 0.8) {
          if (++silent > 20) {
            setReading(null);
            sm.reset();
            inTuneSince.current = null;
            setLocked(false);
          }
          return;
        }
        silent = 0;
        const f = sm.push(p.freq);
        const { tuningMidi: tm, a4: ref } = cfg.current;
        const m = freqToMidi(f, ref);
        const target =
          modeRef.current === 'corde' ? tm.reduce((best, t) => (Math.abs(t - m) < Math.abs(best - m) ? t : best), tm[0]) : Math.round(m);
        const cents = (m - target) * 100;
        setReading({ freq: f, target, cents });
        if (Math.abs(cents) < 3) {
          inTuneSince.current ??= performance.now();
          setLocked(performance.now() - inTuneSince.current > 400);
        } else {
          inTuneSince.current = null;
          setLocked(false);
        }
      };
      tick();
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        src.disconnect();
        setListening(false);
        setReading(null);
      };
      setListening(true);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'Il microfono è bloccato. Consenti l’accesso al microfono per questa pagina nelle impostazioni del browser, poi riprova.'
          : 'Nessun microfono disponibile. Collega un microfono o apri l’app da telefono.',
      );
    }
  }

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const active = reading ? Math.round((cents + 50) / 5) : -1;
  const status = !reading
    ? listening
      ? 'Suona una corda alla volta'
      : 'Premi Ascolta e suona una corda'
    : locked || Math.abs(reading.cents) < 3
      ? 'Intonata'
      : reading.cents < 0
        ? 'Calante: tendi la corda'
        : 'Crescente: allenta la corda';

  const targetString = reading && mode === 'corde' ? tuningMidi.indexOf(reading.target) : -1;

  return (
    <section className="page tuner">
      <div className="seg" role="tablist" aria-label="Modalità accordatore">
        <button role="tab" aria-selected={mode === 'corde'} onClick={() => setMode('corde')}>
          Corde ({tuning.name})
        </button>
        <button role="tab" aria-selected={mode === 'cromatico'} onClick={() => setMode('cromatico')}>
          Cromatico
        </button>
      </div>

      <div className={`tuner-face ${locked ? 'is-locked' : ''} ${reading ? 'has-signal' : ''}`}>
        <div className="tuner-note" aria-live="polite">
          {reading ? (
            <>
              <span className="tn-name">{pcName(reading.target, notation)}</span>
              <span className="tn-oct">{Math.floor(reading.target / 12) - 1}</span>
            </>
          ) : (
            <span className="tn-name tn-idle">–</span>
          )}
        </div>
        <div className="tuner-dots" aria-hidden="true">
          {Array.from({ length: DOTS }, (_, i) => (
            <span
              key={i}
              className={`td ${i === 10 ? 'td-center' : ''} ${i === active ? 'td-on' : ''} ${
                active >= 0 && ((i < 10 && i >= active) || (i > 10 && i <= active)) ? 'td-trail' : ''
              }`}
            />
          ))}
        </div>
        <div className="tuner-scale" aria-hidden="true">
          <span>−50</span>
          <span>0</span>
          <span>+50</span>
        </div>
        <p className="tuner-status">{status}</p>
        <p className="tuner-meta">
          {reading ? `${reading.freq.toFixed(1)} Hz · ${reading.cents >= 0 ? '+' : ''}${reading.cents.toFixed(0)} cent` : ' '}
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <button className={`btn-primary big ${listening ? 'is-on' : ''}`} onClick={() => (listening ? stop.current() : start())}>
        {listening ? 'Ferma' : 'Ascolta'}
      </button>

      <h3 className="h-sub">Note di riferimento</h3>
      <p className="hint">Tocca una corda per sentire la nota giusta e accordare a orecchio.</p>
      <div className="strings-row">
        {tuningMidi.map((m, i) => (
          <button
            key={i}
            className={`string-btn ${targetString === i ? 'is-target' : ''}`}
            onClick={() => referenceTone(midiToFreq(m, a4))}
            aria-label={`Corda ${6 - i}: ${midiName(m, notation)}`}
          >
            <span className="sb-n">{6 - i}ª</span>
            <span className="sb-note">{pcName(m, notation)}</span>
          </button>
        ))}
      </div>

      <div className="calib">
        <span>La di riferimento</span>
        <div className="stepper">
          <button onClick={() => set({ a4: Math.max(425, a4 - 1) })} aria-label="Abbassa La di riferimento">
            −
          </button>
          <strong>{a4} Hz</strong>
          <button onClick={() => set({ a4: Math.min(455, a4 + 1) })} aria-label="Alza La di riferimento">
            +
          </button>
        </div>
      </div>
    </section>
  );
}
