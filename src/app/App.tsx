import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { useTheme } from './useTheme';
import HomePage from '../pages/HomePage';
import SessionPage from '../pages/SessionPage';
import LibraryPage from '../pages/LibraryPage';
import AddWordPage from '../pages/AddWordPage';
import SettingsPage from '../pages/SettingsPage';
import StatsPage from '../pages/StatsPage';

const LINKS = [
  { to: '/', icon: '◎', label: 'Accueil' },
  { to: '/ajouter', icon: '＋', label: 'Ajouter' },
  { to: '/bibliotheque', icon: '☰', label: 'Biblio' },
  { to: '/statistiques', icon: '◍', label: 'Stats' },
  { to: '/reglages', icon: '⚙', label: 'Réglages' },
];

function Nav() {
  return (
    <nav className="nav" aria-label="Navigation principale">
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.to === '/'} className="nav__link">
          <span className="nav__icon" aria-hidden="true">
            {link.icon}
          </span>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Shell() {
  const { settings, ready } = useStore();
  useTheme(settings.theme);

  return (
    <div className="app">
      <Nav />
      <main className="app__main">
        {ready ? (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/seance" element={<SessionPage />} />
            <Route path="/ajouter" element={<AddWordPage />} />
            <Route path="/bibliotheque" element={<LibraryPage />} />
            <Route path="/statistiques" element={<StatsPage />} />
            <Route path="/reglages" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <p className="empty">Chargement…</p>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </StoreProvider>
  );
}
