// Rilevamento dell'altezza (algoritmo YIN, de Cheveigné & Kawahara 2002).

export interface PitchResult {
  freq: number;
  clarity: number; // 0..1, quanto è "pulita" la periodicità
}

export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  opts: { minFreq?: number; maxFreq?: number; threshold?: number; minRms?: number } = {},
): PitchResult | null {
  const minFreq = opts.minFreq ?? 60;
  const maxFreq = opts.maxFreq ?? 1400;
  const threshold = opts.threshold ?? 0.12;
  const minRms = opts.minRms ?? 0.008;

  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < minRms) return null;

  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const w = buf.length - maxTau;
  const d = new Float32Array(maxTau + 1);

  // Funzione differenza
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }
  // Differenza normalizzata cumulativa
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  // Primo minimo sotto soglia
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // Interpolazione parabolica
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const den = a + c - 2 * b;
    if (den !== 0) better = tau + (a - c) / (2 * den);
  }
  return { freq: sampleRate / better, clarity: 1 - cmnd[tau] };
}

/** Mediana mobile per stabilizzare la lettura dell'accordatore. */
export class Smoother {
  private vals: number[] = [];
  constructor(private size = 5) {}
  push(v: number): number {
    this.vals.push(v);
    if (this.vals.length > this.size) this.vals.shift();
    const s = [...this.vals].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  reset() {
    this.vals = [];
  }
}
