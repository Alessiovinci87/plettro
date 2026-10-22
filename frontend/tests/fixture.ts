// Brano finto e regolare per i test: 120 bpm, 4/4, 8 battute da 2 s, due sezioni da 4 battute.
// Accordi: G G C C | D D G G.
import type { Analysis, ChordSeg, Section } from '../src/pages/analysis-types';

const seg = (symbol: string, root: number, quality: string, start: number, end: number): ChordSeg => ({ symbol, root, quality, start, end, beats: (end - start) * 2 });

const section = (label: string, start: number, chart: string[][], chords: ChordSeg[]): Section => ({
  label,
  start,
  end: start + 8,
  bars: 4,
  energy: 0.5,
  dynamics: { level: 3, advice: 'Medio.' },
  chords,
  chart,
  strum: { steps: 'D---D-U---U-D-U-', subdivision: '16', swing: false, palm_mute: false, confidence: 0.6, advice: 'Folk.' },
  tone: { gain: 'pulito', brightness: 'neutro', ambience: 'secco', delay: null, compression: 'leggera' },
  effects: [],
  presets: [],
});

export function fixture(): Analysis {
  const chords = [seg('G', 7, 'major', 0, 4), seg('C', 0, 'major', 4, 8), seg('D', 2, 'major', 8, 12), seg('G', 7, 'major', 12, 16)];
  return {
    duration: 16,
    bpm: 120,
    meter: 4,
    time_signature: '4/4',
    key: { name: 'G', label: 'Sol maggiore', confidence: 0.8, tonic: 7, mode: 'major' },
    separation: { method: 'none', note: '' },
    beats: Array.from({ length: 32 }, (_, i) => i * 0.5),
    downbeats: Array.from({ length: 8 }, (_, i) => i * 2),
    chords,
    sections: [
      section('Strofa', 0, [['G'], ['G'], ['C'], ['C']], chords.slice(0, 2)),
      section('Ritornello', 8, [['D'], ['D'], ['G'], ['G']], chords.slice(2)),
    ],
    melody: { notes: [], suggested_position: 0, method: 'none' },
    capo: { fret: 0, reason: '', shapes: [] },
    tuning: { id: 'standard', name: 'Standard', reason: '' },
    warnings: [],
  };
}
