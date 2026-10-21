import { useState } from 'react';
import { SettingsProvider, useSettings } from './store';
import { Tuner } from './pages/Tuner';
import { Chords } from './pages/Chords';
import { Neck, type NeckFocus } from './pages/Neck';
import { Rhythm } from './pages/Rhythm';
import { Analyze } from './pages/Analyze';
import { Tunings } from './pages/Tunings';
import { pcName } from './music/theory';

type Tab = 'accorda' | 'accordi' | 'manico' | 'ritmo' | 'analisi' | 'accordature';

const TABS: { id: Exclude<Tab, 'accordature'>; label: string; icon: string }[] = [
  { id: 'accorda', label: 'Accorda', icon: 'M12 3v10m0 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'accordi', label: 'Accordi', icon: 'M5 4h14v16H5zM5 9h14M5 14h14M9.7 4v16M14.3 4v16' },
  { id: 'manico', label: 'Manico', icon: 'M2 8h20M2 12h20M2 16h20M7 6v12M12 6v12M17 6v12' },
  { id: 'ritmo', label: 'Ritmo', icon: 'M8 21h8l-2-17h-4zM12 14l5-7' },
  { id: 'analisi', label: 'Analizza', icon: 'M3 12h2l2-6 3 12 3-9 2 5 2-2h4' },
];

function Shell() {
  const [tab, setTab] = useState<Tab>('accorda');
  const [neck, setNeck] = useState<NeckFocus>({ mode: 'scala', root: 9, id: 'penta-min' });
  const { tuning, tuningMidi, notation } = useSettings();

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Plettro</span>
        <button className="tuning-pill" onClick={() => setTab('accordature')} aria-label={`Accordatura: ${tuning.name}. Cambia`}>
          <span className="tp-name">{tuning.name}</span>
          <span className="tp-notes">{tuningMidi.map((m) => pcName(m, notation)).join(' ')}</span>
        </button>
      </header>
      <main>
        {tab === 'accorda' && <Tuner />}
        {tab === 'accordi' && (
          <Chords
            onShowOnNeck={(root, id) => {
              setNeck({ mode: 'accordo', root, id });
              setTab('manico');
            }}
          />
        )}
        {tab === 'manico' && <Neck focus={neck} onFocus={setNeck} />}
        {tab === 'ritmo' && <Rhythm />}
        {tab === 'analisi' && <Analyze />}
        {tab === 'accordature' && <Tunings onDone={() => setTab('accorda')} />}
      </main>
      <nav className="tabbar" aria-label="Sezioni">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
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
