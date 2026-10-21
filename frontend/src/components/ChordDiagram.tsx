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

/**
 * Diagramma verticale stile libro di accordi: corde verticali, capotasto
 * spesso in prima posizione, numero del tasto di partenza a sinistra,
 * dita nei cerchi pieni, x/o sopra le corde.
 */
export function ChordDiagram({
  voicing, tuning, rootPc, quality, label = 'finger', notation = 'intl', width = 150, leftHanded, onToggle, frets: minRows = 4,
}: Props) {
  const n = voicing.frets.length;
  const base = onToggle ? 1 : diagramBaseFret(voicing);
  const played = voicing.frets.filter((f) => f > 0);
  const rows = Math.max(minRows, played.length ? Math.max(...played) - base + 1 : 0);
  const padL = 26;
  const padR = 10;
  const padT = 26;
  const gridW = width - padL - padR;
  const sx = gridW / (n - 1);
  const sy = sx * 1.25;
  const height = padT + rows * sy + 14;
  const x = (s: number) => padL + (leftHanded ? n - 1 - s : s) * sx;
  const y = (f: number) => padT + (f - base + 0.5) * sy;
  const r = Math.min(sx, sy) * 0.44;

  const dotText = (s: number, f: number) => {
    if (label === 'finger') return voicing.fingers[s] ? String(voicing.fingers[s]) : '';
    const pc = mod12(tuning[s] + f);
    if (label === 'note') return pcName(pc, notation);
    return rootPc === undefined ? '' : chordDegree(pc, rootPc, quality);
  };

  // Barrè: una barra per ogni tasto in barres, dalla prima all'ultima corda con lo stesso dito.
  const barreBars = voicing.barres
    .map((bf) => {
      const strings = voicing.frets.map((f, s) => (f === bf ? s : -1)).filter((s) => s >= 0);
      const finger = strings.length ? voicing.fingers[strings[0]] : 0;
      const same = strings.filter((s) => voicing.fingers[s] === finger);
      if (same.length < 2) return null;
      return { fret: bf, from: Math.min(...same), to: Math.max(...same), finger };
    })
    .filter((b): b is NonNullable<typeof b> => !!b);
  const inBarre = (s: number, f: number) => barreBars.some((b) => b.fret === f && s >= b.from && s <= b.to);

  const fs = label === 'finger' ? r * 1.15 : r * (label === 'note' ? 0.95 : 0.9);

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
        <line key={`f${i}`} x1={padL} x2={padL + gridW} y1={padT + i * sy} y2={padT + i * sy} className="d-fret" />
      ))}
      {base === 1 && <rect x={padL - 1} y={padT - 5} width={gridW + 2} height={5} className="d-nut" />}
      {/* corde */}
      {Array.from({ length: n }, (_, s) => (
        <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={padT} y2={padT + rows * sy} className="d-string" />
      ))}
      {base > 1 && (
        <text x={padL - 8} y={padT + sy * 0.5} className="d-basefret" textAnchor="end" dominantBaseline="central">
          {base}ª
        </text>
      )}
      {/* x / o */}
      {voicing.frets.map((f, s) =>
        f <= 0 ? (
          f < 0 ? (
            <g key={`m${s}`} className="d-mute">
              <line x1={x(s) - 4} x2={x(s) + 4} y1={padT - 16} y2={padT - 8} />
              <line x1={x(s) - 4} x2={x(s) + 4} y1={padT - 8} y2={padT - 16} />
            </g>
          ) : (
            <circle key={`o${s}`} cx={x(s)} cy={padT - 12} r={4.2} className="d-open" />
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
            {hideDot && label !== 'finger' && null}
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
