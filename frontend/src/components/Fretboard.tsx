export interface Mark {
  label: string;
  kind: 'root' | 'tone' | 'voicing' | 'dim';
  /** colori delle posizioni a cui appartiene la nota (due se è condivisa) */
  fills?: string[];
  /** la nota che sta suonando adesso */
  now?: boolean;
}

/** Banda che indica dove sta la mano. */
export interface HandBand {
  from: number;
  to: number;
  label: string;
}

interface Props {
  tuning: number[]; // dalla 6ª alla 1ª
  frets?: number;
  mark: (string: number, fret: number) => Mark | null;
  leftHanded?: boolean;
  onPick?: (string: number, fret: number) => void;
  /** nomi delle corde, dalla 6ª alla 1ª, scritti accanto al capotasto */
  stringLabels?: string[];
  band?: HandBand | null;
}

const INLAY = [3, 5, 7, 9, 15, 17, 19, 21];

/** Mezzo cerchio sinistro o destro, per le note condivise da due posizioni. */
const half = (cx: number, cy: number, r: number, left: boolean) => `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${left ? 0 : 1} ${cx} ${cy + r} Z`;

/** Manico orizzontale: in alto la 1ª corda (come nelle tablature). */
export function Fretboard({ tuning, frets = 15, mark, leftHanded, onPick, stringLabels, band }: Props) {
  const n = tuning.length;
  const fw = 46;
  // corde abbastanza distanti perché gli intarsi stiano tra i pallini senza finirci sotto
  const sh = 34;
  const r = 12;
  const inlayR = 4.5;
  const labelW = stringLabels ? 50 : 0;
  const openW = 36;
  const padT = band ? 34 : 16;
  const w = labelW + openW + frets * fw + 8;
  const h = padT + (n - 1) * sh + 30;
  const fx = (f: number) => {
    const raw = f === 0 ? labelW + openW / 2 : labelW + openW + (f - 0.5) * fw;
    return leftHanded ? w - raw : raw;
  };
  const wireX = (i: number) => (leftHanded ? w - (labelW + openW + i * fw) : labelW + openW + i * fw);
  const sy = (s: number) => padT + (n - 1 - s) * sh; // s=0 (6ª) in basso
  const between = (k: number) => padT + sh * (k + 0.5); // a metà tra due corde (k contato dall'alto)
  const left = Math.min(wireX(0), wireX(frets));

  return (
    <div className="neck-scroll">
      {/* minWidth: su schermi stretti si scorre invece di rimpicciolire note e numeri */}
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ minWidth: w }} className="neck" role="img" aria-label="Manico della chitarra">
        <rect x={left} y={padT - 8} width={frets * fw} height={(n - 1) * sh + 16} className="neck-wood" />
        {band && band.to >= 1 && band.from <= frets && (
          <g className="neck-band">
            <rect
              x={Math.min(wireX(Math.max(0, band.from - 1)), wireX(Math.min(frets, band.to)))}
              y={padT - 8}
              width={Math.abs(wireX(Math.min(frets, band.to)) - wireX(Math.max(0, band.from - 1)))}
              height={(n - 1) * sh + 16}
              rx={6}
            />
            <text x={(wireX(Math.max(0, band.from - 1)) + wireX(Math.min(frets, band.to))) / 2} y={padT - 16} textAnchor="middle">
              {band.label}
            </text>
          </g>
        )}
        {INLAY.filter((f) => f <= frets).map((f) => (
          <circle key={f} cx={fx(f)} cy={between((n - 2) / 2)} r={inlayR} className="neck-inlay" />
        ))}
        {frets >= 12 && (
          <>
            <circle cx={fx(12)} cy={between(1)} r={inlayR} className="neck-inlay" />
            <circle cx={fx(12)} cy={between(n - 3)} r={inlayR} className="neck-inlay" />
          </>
        )}
        {Array.from({ length: frets + 1 }, (_, i) => (
          <line key={i} x1={wireX(i)} x2={wireX(i)} y1={padT - 8} y2={padT + (n - 1) * sh + 8} className={i === 0 ? 'neck-nut' : 'neck-wire'} />
        ))}
        {tuning.map((_, s) => (
          <line key={s} x1={left} x2={Math.max(wireX(0), wireX(frets))} y1={sy(s)} y2={sy(s)} className="neck-string" style={{ strokeWidth: 2.1 - (1.4 * s) / Math.max(1, n - 1) }} />
        ))}
        {stringLabels?.map((l, s) => (
          <text key={`l${s}`} x={leftHanded ? w - 4 : 4} y={sy(s)} className="neck-label" textAnchor={leftHanded ? 'end' : 'start'} dominantBaseline="central">
            {l}
          </text>
        ))}
        {Array.from({ length: frets }, (_, i) => i + 1)
          .filter((f) => [1, 3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f))
          .map((f) => (
            <text key={`n${f}`} x={fx(f)} y={h - 6} className="neck-num" textAnchor="middle">
              {f}
            </text>
          ))}
        {tuning.map((_, s) =>
          Array.from({ length: frets + 1 }, (_, f) => {
            const m = mark(s, f);
            const hit = onPick ? (
              <rect key={`h${s}-${f}`} x={fx(f) - (f === 0 ? openW : fw) / 2} y={sy(s) - sh / 2} width={f === 0 ? openW : fw} height={sh} fill="transparent" onClick={() => onPick(s, f)} />
            ) : null;
            if (!m) return hit;
            const cx = fx(f);
            const cy = sy(s);
            return (
              <g key={`m${s}-${f}`} className={`neck-mark k-${m.kind}${m.fills ? ' is-colored' : ''}${m.now ? ' is-now' : ''}`}>
                {m.now && <circle cx={cx} cy={cy} r={r + 5} className="neck-now" />}
                {m.fills && m.fills.length > 1 ? (
                  <>
                    <path d={half(cx, cy, r, true)} style={{ fill: m.fills[0] }} />
                    <path d={half(cx, cy, r, false)} style={{ fill: m.fills[1] }} />
                    <circle cx={cx} cy={cy} r={r} className="neck-ring" />
                  </>
                ) : (
                  <circle cx={cx} cy={cy} r={r} style={m.fills ? { fill: m.fills[0] } : undefined} />
                )}
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                  {m.label}
                </text>
                {hit}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
