export interface Mark {
  label: string;
  kind: 'root' | 'tone' | 'voicing' | 'dim';
}

interface Props {
  tuning: number[]; // dalla 6ª alla 1ª
  frets?: number;
  mark: (string: number, fret: number) => Mark | null;
  leftHanded?: boolean;
  onPick?: (string: number, fret: number) => void;
}

const INLAY = [3, 5, 7, 9, 15, 17, 19, 21];

/** Manico orizzontale: in alto la 1ª corda (come nelle tablature). */
export function Fretboard({ tuning, frets = 15, mark, leftHanded, onPick }: Props) {
  const n = tuning.length;
  const fw = 46;
  const sh = 30;
  const openW = 36;
  const padT = 16;
  const w = openW + frets * fw + 8;
  const h = padT + (n - 1) * sh + 30;
  const fx = (f: number) => {
    const raw = f === 0 ? openW / 2 : openW + (f - 0.5) * fw;
    return leftHanded ? w - raw : raw;
  };
  const wireX = (i: number) => (leftHanded ? w - (openW + i * fw) : openW + i * fw);
  const sy = (s: number) => padT + (n - 1 - s) * sh; // s=0 (6ª) in basso

  return (
    <div className="neck-scroll">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="neck" role="img" aria-label="Manico della chitarra">
        <rect x={Math.min(wireX(0), wireX(frets))} y={padT - 8} width={frets * fw} height={(n - 1) * sh + 16} className="neck-wood" />
        {INLAY.filter((f) => f <= frets).map((f) => (
          <circle key={f} cx={fx(f)} cy={padT + ((n - 1) * sh) / 2} r={6} className="neck-inlay" />
        ))}
        {frets >= 12 && (
          <>
            <circle cx={fx(12)} cy={padT + sh * 1.5} r={6} className="neck-inlay" />
            <circle cx={fx(12)} cy={padT + sh * (n - 2.5)} r={6} className="neck-inlay" />
          </>
        )}
        {Array.from({ length: frets + 1 }, (_, i) => (
          <line key={i} x1={wireX(i)} x2={wireX(i)} y1={padT - 8} y2={padT + (n - 1) * sh + 8} className={i === 0 ? 'neck-nut' : 'neck-wire'} />
        ))}
        {tuning.map((_, s) => (
          <line key={s} x1={Math.min(wireX(0), wireX(frets))} x2={Math.max(wireX(0), wireX(frets))} y1={sy(s)} y2={sy(s)} className="neck-string" style={{ strokeWidth: 2.1 - (1.4 * s) / Math.max(1, n - 1) }} />
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
            return (
              <g key={`m${s}-${f}`} className={`neck-mark k-${m.kind}`}>
                <circle cx={fx(f)} cy={sy(s)} r={12} />
                <text x={fx(f)} y={sy(s)} textAnchor="middle" dominantBaseline="central">
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
