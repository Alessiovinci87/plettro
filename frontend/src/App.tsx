import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SettingsProvider, useSettings } from './store';
import { Tuner } from './pages/Tuner';
import { Chords } from './pages/Chords';
import { Neck, type NeckFocus } from './pages/Neck';
import { Rhythm } from './pages/Rhythm';
import { Analyze } from './pages/Analyze';
import { Tunings } from './pages/Tunings';
import { pcName } from './music/theory';

type Tab = 'accorda' | 'accordi' | 'manico' | 'ritmo' | 'analisi' | 'accordature';

const ICONS: Record<Tab, ReactNode> = {
  // diapason
  accorda: <path d="M9 2.5v7.5a3 3 0 0 0 6 0V2.5M12 13v8.5M9.5 21.5h5" />,
  // diagramma d'accordo
  accordi: (
    <>
      <path d="M6 3.5h12M6 3.5v17M10 3.5v17M14 3.5v17M18 3.5v17M6 9h12M6 14.5h12M6 20.5h12" />
      <circle cx="10" cy="6.3" r="1.6" className="fill" />
      <circle cx="14" cy="11.8" r="1.6" className="fill" />
    </>
  ),
  // manico con intarsi
  manico: (
    <>
      <path d="M2.5 7h19M2.5 12h19M2.5 17h19M7 5v14M12.5 5v14M18 5v14" />
      <circle cx="15.2" cy="9.5" r="1.3" className="fill" />
    </>
  ),
  // metronomo
  ritmo: <path d="M7 21.5h10L14.2 3h-4.4zM12 15.5l5-8.5M8.6 16.5h6.8" />,
  // forma d'onda
  analisi: <path d="M3.5 10v4M7.5 6.5v11M11.5 3.5v17M15.5 8v8M19.5 10.5v3" />,
  // chiavette
  accordature: (
    <>
      <path d="M8 3v18M16 3v18" />
      <circle cx="4.5" cy="7" r="1.8" />
      <circle cx="4.5" cy="15" r="1.8" />
      <circle cx="19.5" cy="7" r="1.8" />
      <circle cx="19.5" cy="15" r="1.8" />
      <path d="M6.3 7H8M6.3 15H8M16 7h1.7M16 15h1.7" />
    </>
  ),
};

const NAV: { id: Tab; label: string; title: string; short?: string }[] = [
  { id: 'accorda', label: 'Accorda', title: 'Accordatore' },
  { id: 'accordi', label: 'Accordi', title: 'Libro accordi' },
  { id: 'manico', label: 'Manico', title: 'Manico' },
  { id: 'ritmo', label: 'Ritmo', title: 'Ritmo' },
  { id: 'analisi', label: 'Analizza', title: 'Suona con il brano', short: 'Suona il brano' },
  { id: 'accordature', label: 'Accordature', title: 'Accordature' },
];

function Icon({ tab }: { tab: Tab }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      {ICONS[tab]}
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <path d="M16 3c7.6 0 12.5 3.6 12.5 9.2C28.5 20.4 20.6 28 16 29.6 11.4 28 3.5 20.4 3.5 12.2 3.5 6.6 8.4 3 16 3z" className="logo-pick" />
      <path d="M11 11.5c1.6-1.3 3.3-2 5-2s3.4.7 5 2" className="logo-string" />
      <path d="M12.2 15.5c1.2-.9 2.5-1.3 3.8-1.3s2.6.4 3.8 1.3" className="logo-string" />
    </svg>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('accorda');
  const [neck, setNeck] = useState<NeckFocus>({ mode: 'scala', root: 9, id: 'penta-min' });
  const { tuning, tuningMidi, notation } = useSettings();
  const current = NAV.find((n) => n.id === tab)!;
  const topbar = useRef<HTMLElement>(null);

  // altezza reale della barra in alto in --topbar-h: serve a chi scorre o resta fisso sotto di lei
  useEffect(() => {
    const el = topbar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--topbar-h', `${el.getBoundingClientRect().height}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Plettro">
        <div className="side-brand">
          <Logo />
          <span>Plettro</span>
        </div>
        <nav className="side-nav" aria-label="Sezioni">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? 'is-active' : ''} onClick={() => go(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
              <Icon tab={n.id} />
              <span>{n.title}</span>
            </button>
          ))}
        </nav>
        <p className="side-foot">Accordatura: {tuning.name}</p>
      </aside>

      <div className="main-col">
        <header className="topbar" ref={topbar}>
          <div className="tb-title">
            <span className="tb-logo">
              <Logo />
            </span>
            <h1>
              <span className="t-long">{current.title}</span>
              <span className="t-short">{current.short ?? current.title}</span>
            </h1>
          </div>
          <button className="tuning-pill" onClick={() => go('accordature')} aria-label={`Accordatura: ${tuning.name}. Cambia`}>
            <span className="tp-name">{tuning.name}</span>
            <span className="tp-notes">{tuningMidi.map((m) => pcName(m, notation)).join(' ')}</span>
          </button>
        </header>
        <main className={`main main-${tab}`}>
          {tab === 'accorda' && <Tuner />}
          {tab === 'accordi' && (
            <Chords
              onShowOnNeck={(root, id) => {
                setNeck({ mode: 'accordo', root, id });
                go('manico');
              }}
            />
          )}
          {tab === 'manico' && <Neck focus={neck} onFocus={setNeck} />}
          {tab === 'ritmo' && <Rhythm />}
          {tab === 'analisi' && <Analyze />}
          {tab === 'accordature' && <Tunings onDone={() => go('accorda')} />}
        </main>
      </div>

      <nav className="tabbar" aria-label="Sezioni">
        {NAV.filter((n) => n.id !== 'accordature').map((n) => (
          <button key={n.id} className={tab === n.id ? 'is-active' : ''} onClick={() => go(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
            <Icon tab={n.id} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  );
}
