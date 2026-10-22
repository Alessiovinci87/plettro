// Quadrante dell'accordatore: arco da −50 a +50 cent con lancetta.

interface Props {
  cents: number | null; // null = nessun segnale
  locked: boolean;
}

const R = 128;
const CX = 160;
const CY = 156;
const SPAN = 56; // gradi per 50 cent

const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
};

function arc(from: number, to: number, r: number) {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function Gauge({ cents, locked }: Props) {
  const c = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const angle = (c / 50) * SPAN;
  const ticks = [];
  for (let v = -50; v <= 50; v += 5) {
    const major = v % 25 === 0;
    const deg = (v / 50) * SPAN;
    const [x0, y0] = polar(deg, R + (major ? 10 : 6));
    const [x1, y1] = polar(deg, R - 2);
    ticks.push(<line key={v} x1={x0} y1={y0} x2={x1} y2={y1} className={major ? 'g-tick major' : 'g-tick'} />);
  }
  const labels = [-50, -25, 25, 50].map((v) => {
    const [x, y] = polar((v / 50) * SPAN, R + 24);
    return (
      <text key={v} x={x} y={y} className="g-label" textAnchor="middle" dominantBaseline="central">
        {v > 0 ? `+${v}` : `−${-v}`}
      </text>
    );
  });
  const state = cents === null ? 'idle' : locked || Math.abs(cents) < 3 ? 'ok' : Math.abs(cents) < 15 ? 'near' : 'far';
  const [nx, ny] = polar(angle, R - 14);

  return (
    <svg className={`gauge g-${state}`} viewBox="0 -18 320 194" role="img" aria-label={cents === null ? 'Nessun segnale' : `${Math.round(c)} cent`}>
      <path d={arc(-SPAN, SPAN, R)} className="g-track" />
      <path d={arc((-3 / 50) * SPAN, (3 / 50) * SPAN, R)} className="g-zone" />
      {cents !== null && <path d={c < 0 ? arc(angle, 0, R) : arc(0, angle, R)} className="g-fill" />}
      {ticks}
      {labels}
      <text x={CX} y={CY - R - 22} className="g-zero" textAnchor="middle">
        0
      </text>
      <line x1={CX} y1={CY} x2={nx} y2={ny} className="g-needle" />
      <circle cx={CX} cy={CY} r={7} className="g-hub" />
    </svg>
  );
}
