import type { Voicing } from '../music/voicings';
import { diagramBaseFret } from '../music/voicings';
import { chordDegree, mod12, pcName, type Notation, type Quality } from '../music/theory';

export type DotLabel = 'finger' | 'note' | 'degree';

interface Props {
  voicing: Voicing;
  tuning: number[];
  rootPc?: number;
  quality?: Quality;
  label?: DotLabel;
  notation?: Notation;
  width?: number;
  leftHanded?: boolean;
  onToggle?: (string: number, fret: number) => void; // modalità modifica
  frets?: number; // righe minime
}

/** Barre da disegnare: stesso dito sullo stesso tasto su più corde, senza corde a vuoto in mezzo. */
export function fingerBars(voicing: Voicing): { fret: number; from: number; to: number; finger: number }[] {
  const bars: { fret: number; from: number; to: number; finger: number }[] = [];
  const seen = new Set<string>();
  voicing.frets.forEach((f, s) => {
    const finger = voicing.fingers[s];
    if (f <= 0 || !finger || seen.has(`${f}:${finger}`)) return;
    seen.add(`${f}:${finger}`);
    const strings = voicing.frets.map((g, t) => (g === f && voicing.fingers[t] === finger ? t : -1)).filter((t) => t >= 0);
    if (strings.length < 2) return;
    const from = Math.min(...strings);
    const to = Math.max(...strings);
    // una corda a vuoto in mezzo verrebbe zittita dal dito steso: niente barra
    if (voicing.frets.slice(from, to + 1).some((g) => g === 0)) return;
    bars.push({ fret: f, from, to, finger });
  });
  return bars;
}

/**
 * Diagramma verticale stile libro di accordi: corde verticali, capotasto
 * spesso in prima posizione, numero del tasto di partenza in una colonna
 * fissa a sinistra, dita nei cerchi pieni, x/o sopra le corde.
 * Tutte le misure sono proporzionali alla larghezza: a pari `width` e `frets`
 * due diagrammi hanno la stessa dimensione e la stessa griglia.
 */
export function ChordDiagram({
  voicing, tuning, rootPc, quality, label = 'finger', notation = 'intl', width = 150, leftHanded, onToggle, frets: minRows = 4,
}: Props) {
  const n = voicing.frets.length;
  const base = onToggle ? 1 : diagramBaseFret(voicing);
  const played = voicing.frets.filter((f) => f > 0);
  const rows = Math.max(minRows, played.length ? Math.max(...played) - base + 1 : 0);
  const u = width / 150;
  const colW = 20 * u; // colonna del numero di tasto
  const padL = colW + 16 * u; // spazio per il barrè che sporge oltre la 6ª corda
  const padR = 12 * u;
  const padT = 26 * u;
  const gridW = width - padL - padR;
  const sx = gridW / (n - 1);
  const sy = sx * 1.3;
  const height = padT + rows * sy + 8 * u;
  const x = (s: number) => padL + (leftHanded ? n - 1 - s : s) * sx;
  const y = (f: number) => padT + (f - base + 0.5) * sy;
  // raggio sotto metà del passo: tra due pallini vicini resta sempre aria
  const r = Math.min(sx, sy) * 0.38;

  const dotText = (s: number, f: number) => {
    if (label === 'finger') return voicing.fingers[s] ? String(voicing.fingers[s]) : '';
    const pc = mod12(tuning[s] + f);
    if (label === 'note') return pcName(pc, notation);
    return rootPc === undefined ? '' : chordDegree(pc, rootPc, quality);
  };

  const barreBars = fingerBars(voicing);
  const inBarre = (s: number, f: number) => barreBars.some((b) => b.fret === f && s >= b.from && s <= b.to);

  const fs = label === 'finger' ? r * 1.45 : r * (label === 'note' ? 1.1 : 1.05);
  const mark = 4 * u;
  const lw = Math.max(u, 1); // linee della griglia mai sotto il pixel

  return (
    <svg
      className="diagram"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Diteggiatura ${voicing.frets.map((f) => (f < 0 ? 'x' : f)).join(' ')}`}
    >
      {/* tasti */}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`f${i}`} x1={padL} x2={padL + gridW} y1={padT + i * sy} y2={padT + i * sy} className="d-fret" strokeWidth={lw} />
      ))}
      {base === 1 && <rect x={padL - 0.5 * u} y={padT - 5 * u} width={gridW + u} height={5 * u} className="d-nut" />}
      {/* corde */}
      {Array.from({ length: n }, (_, s) => (
        <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={padT} y2={padT + rows * sy} className="d-string" strokeWidth={1.1 * lw} />
      ))}
      {base > 1 && (
        <text x={colW} y={y(base)} className="d-basefret" fontSize={14 * u} textAnchor="end" dominantBaseline="central">
          {base}ª
        </text>
      )}
      {/* x / o */}
      {voicing.frets.map((f, s) =>
        f <= 0 ? (
          f < 0 ? (
            <g key={`m${s}`} className="d-mute" strokeWidth={1.6 * u}>
              <line x1={x(s) - mark} x2={x(s) + mark} y1={padT - 16 * u} y2={padT - 8 * u} />
              <line x1={x(s) - mark} x2={x(s) + mark} y1={padT - 8 * u} y2={padT - 16 * u} />
            </g>
          ) : (
            <circle key={`o${s}`} cx={x(s)} cy={padT - 12 * u} r={4.2 * u} className="d-open" strokeWidth={1.5 * u} />
          )
        ) : null,
      )}
      {barreBars.map((b) => (
        <g key={`b${b.fret}`}>
          <rect
            x={Math.min(x(b.from), x(b.to)) - r}
            y={y(b.fret) - r}
            width={Math.abs(x(b.to) - x(b.from)) + 2 * r}
            height={2 * r}
            rx={r}
            className="d-dot"
          />
          {label === 'finger' && (
            <text x={(x(b.from) + x(b.to)) / 2} y={y(b.fret)} className="d-dot-t" fontSize={fs} textAnchor="middle" dominantBaseline="central">
              {b.finger}
            </text>
          )}
        </g>
      ))}
      {voicing.frets.map((f, s) => {
        if (f <= 0) return null;
        const isRoot = rootPc !== undefined && mod12(tuning[s] + f) === mod12(rootPc);
        const hideDot = inBarre(s, f) && label === 'finger';
        return (
          <g key={`d${s}`}>
            {!hideDot && <circle cx={x(s)} cy={y(f)} r={r} className={isRoot && label !== 'finger' ? 'd-dot d-root' : 'd-dot'} />}
            {!hideDot && (
              <text x={x(s)} y={y(f)} className="d-dot-t" fontSize={fs} textAnchor="middle" dominantBaseline="central">
                {dotText(s, f)}
              </text>
            )}
          </g>
        );
      })}
      {/* hit area per la modalità "che accordo è" */}
      {onToggle &&
        Array.from({ length: n }, (_, s) =>
          Array.from({ length: rows + 1 }, (_, i) => (
            <rect
              key={`h${s}-${i}`}
              x={x(s) - sx / 2}
              y={i === 0 ? 0 : padT + (i - 1) * sy}
              width={sx}
              height={i === 0 ? padT : sy}
              fill="transparent"
              onClick={() => onToggle(s, i)}
            />
          )),
        )}
    </svg>
  );
}
