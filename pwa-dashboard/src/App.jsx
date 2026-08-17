import { Routes, Route, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useLenis } from './lib/useLenis.js';
import { useGames } from './lib/useGames.js';
import { LeagueProvider, useLeague } from './lib/useLeague.jsx';
import { AuthProvider, useAuth } from './lib/useAuth.jsx';
import { censorName } from './lib/censor.js';
import { fetchPlayers } from './api/players.js';
import { fetchLeaderboard } from './api/stats.js';
import CalloutModal from './components/CalloutModal.jsx';
import OnboardingModal from './components/OnboardingModal.jsx';
// Landing "/" : le Hero + le hub (drawer) sont montés d'emblée → statiques.
import Hero from './scenes/Hero.jsx';
import Standings from './scenes/Standings.jsx';
import Feed from './scenes/Feed.jsx';
import Trends from './scenes/Trends.jsx';
import Trophies from './scenes/Trophies.jsx';
import LiveTicker from './components/LiveTicker.jsx';
import LobbyDrawer from './components/LobbyDrawer.jsx';
import NemesisWall from './components/NemesisWall.jsx';
import BottomTabs from './components/BottomTabs.jsx';
import { fetchTournaments } from './api/tournaments.js';
import './App.css';

// Routes secondaires chargées à la demande — sorties du bundle initial (E1) :
// profils, trophées, ligues, guides, admin… ne sont tirés qu'à la navigation.
const PlayerProfile = lazy(() => import('./routes/PlayerProfile.jsx'));
const PlayersIndex = lazy(() => import('./routes/PlayersIndex.jsx'));
const TrophiesPage = lazy(() => import('./routes/TrophiesPage.jsx'));
const XpGuide = lazy(() => import('./routes/XpGuide.jsx'));
const RankGuide = lazy(() => import('./routes/RankGuide.jsx'));
const Leagues = lazy(() => import('./routes/Leagues.jsx'));
const Palmares = lazy(() => import('./routes/Palmares.jsx'));
const Welcome = lazy(() => import('./routes/Welcome.jsx'));
const Login = lazy(() => import('./routes/Login.jsx'));
const MyProfile = lazy(() => import('./routes/MyProfile.jsx'));
const Admin = lazy(() => import('./routes/Admin.jsx'));
const Tournois = lazy(() => import('./routes/Tournois.jsx'));
const Styleguide = lazy(() => import('./routes/Styleguide.jsx'));

// Le Lobby Cinématique (Epic 5) : le premier écran = le Hero, rien d'autre.
// Le hub (classement, feed, tendances, trophées) suit dans la page — on y
// descend au scroll, ou on l'appelle d'un coup via le tiroir. Le LIVE reste
// une barre HUD sous le header.
function Home({ games, stats, ranked, profiles = {}, eloBoard }) {
  return (
    <main>
      <LiveTicker />
      <Hero ranked={ranked} profiles={profiles} eloBoard={eloBoard} />
      <LobbyDrawer>
        <Standings ranked={ranked} profiles={profiles} />
        <NemesisWall ranked={ranked} profiles={profiles} />
        <Feed games={games} profiles={profiles} />
        <Trends games={games} ranked={ranked} profiles={profiles} />
        <Trophies stats={stats} profiles={profiles} />
      </LobbyDrawer>
    </main>
  );
}

// Squelette de chargement de l'accueil : au lieu d'un écran noir de plusieurs
// secondes, on montre la forme de l'accueil pendant que les parties chargent.
function HomeSkeleton() {
  return (
    <main className="home-skel shell" aria-busy="true">
      <div className="home-skel__banner sk" />
      <div className="home-skel__rows">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="home-skel__row sk" />)}
      </div>
    </main>
  );
}

// État d'erreur de l'accueil — message + réessai, sans bloquer le reste de
// l'application (nav et autres routes restent utilisables).
function HomeState({ message, retry }) {
  return (
    <main className="home-state shell">
      <p className="eyebrow">{message}</p>
      {retry && (
        <button className="home-state__retry" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      )}
    </main>
  );
}

const ORDINALS = ['1er', '2e', '3e'];
const ordinal = (n) => ORDINALS[n - 1] ?? `${n}e`;

// Elo leaderboard (name/elo/rank/...) — scoped à la ligue active quand il y
// en a une : les positions (et donc le Roi du Hero et le rang du header)
// deviennent relatives à la ligue ; la valeur elo reste la cote globale.
function useEloBoard(leagueId) {
  const [board, setBoard] = useState([]);
  useEffect(() => {
    fetchLeaderboard(undefined, leagueId).then(setBoard).catch(() => {});
  }, [leagueId]);
  return board;
}

// Backend player rows (display_name/avatar_url/flight_image_url/accent_color),
// looked up by name to enrich the client-computed stats — fetched once,
// independent of login state since it's plain public GET /players data.
function usePlayerProfiles() {
  const [profiles, setProfiles] = useState({});
  useEffect(() => {
    fetchPlayers()
      .then(rows => setProfiles(Object.fromEntries(rows.map(p => [p.name, p]))))
      .catch(() => {});
  }, []);
  return profiles;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Fallback pendant le chargement d'un chunk de route lazy (E1). Réutilise le
// spinner de boot — transition brève, cohérente avec l'écran de chargement.
function RouteFallback() {
  return (
    <div className="boot">
      <div className="boot__spinner" />
    </div>
  );
}

const COOLDOWN_MS = 15 * 60 * 1000;
const CALLOUT_TS_KEY = 'dartsCalloutLastSent';

function calloutRemainingMs() {
  const last = parseInt(localStorage.getItem(CALLOUT_TS_KEY) || '0', 10);
  return Math.max(0, COOLDOWN_MS - (Date.now() - last));
}

function fmtCountdown(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}m${(s % 60).toString().padStart(2, '0')}s`;
}

function AppInner() {
  useLenis();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const profiles = usePlayerProfiles();
  const { leagues, activeLeague, activateLeague, ready: leaguesReady } = useLeague();
  const eloBoard = useEloBoard(activeLeague?.id);
  const { games, allGames, stats, ranked, loading, error } = useGames(activeLeague?.players ?? null);
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [calloutRemaining, setCalloutRemaining] = useState(calloutRemainingMs);
  const [menuOpen, setMenuOpen] = useState(false);

  // Badge rouge de l'onglet Tournois : inscriptions ouvertes ou LIVE.
  const [openTournaments, setOpenTournaments] = useState(0);
  useEffect(() => {
    const league = activeLeague ?? leagues[0];
    if (!league) { setOpenTournaments(0); return; }
    fetchTournaments(league.id)
      .then(rows => setOpenTournaments(rows.filter(t => t.phase !== 'past').length))
      .catch(() => setOpenTournaments(0));
  }, [activeLeague?.id, leagues.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Local cache of the cooldown countdown — Redis on the backend is the
  // actual source of truth (per-account, not per-browser); this just seeds
  // the UI optimistically and gets corrected by a 429's retry_after_seconds
  // if another device already pinged within the window.
  function markCooldown(remainingMs) {
    localStorage.setItem(CALLOUT_TS_KEY, (Date.now() - (COOLDOWN_MS - remainingMs)).toString());
    setCalloutRemaining(remainingMs);
  }

  function openCallout() {
    if (!auth.player) { navigate('/login'); return; }
    setCalloutOpen(true);
  }

  useEffect(() => {
    if (calloutRemaining <= 0) return;
    const id = setInterval(() => {
      const rem = calloutRemainingMs();
      setCalloutRemaining(rem);
    }, 1000);
    return () => clearInterval(id);
  }, [calloutRemaining > 0]);

  // La référence du design system ne dépend d'aucune donnée : elle reste
  // consultable backend éteint, ce qui est précisément quand on veut inspecter
  // des tokens. Elle passe donc AVANT le verrou de chargement ci-dessous.
  if (location.pathname === '/styleguide') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Styleguide />
      </Suspense>
    );
  }

  // Seule la lecture de l'auth et des ligues bloque la coquille — c'est rapide.
  // Le chargement des PARTIES ne bloque plus toute l'application (fini l'écran
  // noir de plusieurs secondes) : la nav et les routes sans données rendent tout
  // de suite, et l'accueil gère son propre état (squelette / erreur) ci-dessous.
  if (!auth.ready || !leaguesReady) {
    return (
      <div className="boot">
        <div className="boot__spinner" />
        <p className="eyebrow">Chargement…</p>
      </div>
    );
  }

  // Onboarding wall on the home routes only: account + at least one league.
  // Other routes (/login, /ligues, /profils, …) stay reachable — this is
  // onboarding, not authorization.
  const onboardingDone = Boolean(auth.player && leagues.length > 0);
  const home = !onboardingDone
    ? <Welcome hasAccount={!!auth.player} />
    : error
      ? <HomeState message={`Impossible de charger les parties — ${error.message}`} retry />
      : loading
        ? <HomeSkeleton />
        : <Home games={games} stats={stats} ranked={ranked} profiles={profiles} eloBoard={eloBoard} />;

  const knownPlayers = allGames
    ? [...new Set(allGames.flatMap(g => g.players ?? []))].sort((a, b) => a.localeCompare(b, 'fr'))
    : [];

  // Mon rang dans le header : [Pseudo | Silver III · 1000 (7e)] — position et
  // elo suivent la ligue active (eloBoard est rescopé par useEloBoard).
  const myIdx = auth.player ? eloBoard.findIndex(r => r.name === auth.player.name) : -1;
  const myEntry = myIdx >= 0 ? eloBoard[myIdx] : null;

  return (
    <>
      <ScrollTop />
      <nav className="nav">
        <Link to="/" className="nav__brand display">DC</Link>

        {/* Destinations en onglets (desktop) — masquées sous 768px, où elles
            passent dans le tiroir « Plus ». */}
        <div className="nav__tabs">
          <NavLink to="/" end className={({ isActive }) => `nav__tab${isActive ? ' is-active' : ''}`}>Classement</NavLink>
          <NavLink to="/profils" className={({ isActive }) => `nav__tab${isActive ? ' is-active' : ''}`}>Joueurs</NavLink>
          <NavLink to="/trophees" className={({ isActive }) => `nav__tab${isActive ? ' is-active' : ''}`}>Trophées</NavLink>
          <NavLink to="/ligues" className={({ isActive }) => `nav__tab${isActive ? ' is-active' : ''}`}>Ligues</NavLink>
          <NavLink to="/tournois" className={({ isActive }) => `nav__tab${isActive ? ' is-active' : ''}`}>
            Tournois{openTournaments > 0 && <span className="nav__badge">{openTournaments}</span>}
          </NavLink>
        </div>

        <div className="nav__right">
          {leagues.length > 0 && (
            <select
              className="nav__league"
              value={activeLeague?.id ?? ''}
              aria-label="Ligue active"
              onChange={e => {
                const id = e.target.value;
                // activateLeague est un toggle : re-passer l'id actif le désactive.
                if (id) { if (activeLeague?.id !== id) activateLeague(id); }
                else if (activeLeague) activateLeague(activeLeague.id);
              }}
            >
              <option value="">Toutes les ligues</option>
              {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <Link to={auth.player ? '/profile' : '/login'} className="nav__account">
            {auth.player ? censorName(auth.player.display_name || auth.player.name) : 'Connexion'}
            {myEntry && <span className="nav__rank"> · {myEntry.rank} · {myEntry.elo} · {ordinal(myIdx + 1)}</span>}
          </Link>
          <button className="nav__more" onClick={() => setMenuOpen(o => !o)} aria-label="Plus">
            {menuOpen ? '✕' : 'Plus'}
          </button>
        </div>
      </nav>
      {menuOpen && (
        <>
          <div className="nav__backdrop" onClick={() => setMenuOpen(false)} />
          <div className="nav__drawer">
            {/* Destinations principales — dans le tiroir seulement en mobile
                (en onglets sur desktop). */}
            <NavLink to="/" end className={({ isActive }) => `nav__drawer-main${isActive ? ' is-active' : ''}`}>Classement</NavLink>
            <NavLink to="/profils" className={({ isActive }) => `nav__drawer-main${isActive ? ' is-active' : ''}`}>Joueurs</NavLink>
            <NavLink to="/trophees" className={({ isActive }) => `nav__drawer-main${isActive ? ' is-active' : ''}`}>Trophées</NavLink>
            <NavLink to="/ligues" className={({ isActive }) => `nav__drawer-main${isActive ? ' is-active' : ''}`}>Ligues</NavLink>
            <NavLink to="/tournois" className={({ isActive }) => `nav__drawer-main${isActive ? ' is-active' : ''}`}>
              Tournois{openTournaments > 0 && <span className="nav__badge">{openTournaments}</span>}
            </NavLink>
            {/* Le « Plus » — toujours dans le tiroir. */}
            <NavLink to="/palmares" className={({ isActive }) => isActive ? 'is-active' : undefined}>Palmarès</NavLink>
            <NavLink to="/xp" className={({ isActive }) => isActive ? 'is-active' : undefined}>XP</NavLink>
            <NavLink to="/rangs" className={({ isActive }) => isActive ? 'is-active' : undefined}>Rangs</NavLink>
            {auth.player?.is_admin && <NavLink to="/admin" className={({ isActive }) => isActive ? 'is-active' : undefined}>Admin</NavLink>}
            {auth.player && (
              <button
                className="nav__drawer-btn"
                disabled={calloutRemaining > 0}
                onClick={() => { setMenuOpen(false); openCallout(); }}
              >
                {calloutRemaining > 0 ? `⏳ ${fmtCountdown(calloutRemaining)}` : '🔔 Défier un pote'}
              </button>
            )}
            <span className="nav__count">{(allGames ?? games).length} parties</span>
          </div>
        </>
      )}

      <OnboardingModal />

      <CalloutModal
        open={calloutOpen}
        onClose={() => setCalloutOpen(false)}
        onSent={() => markCooldown(COOLDOWN_MS)}
        onCooldown={(retryAfterSeconds) => markCooldown(retryAfterSeconds * 1000)}
        token={auth.token}
        name={auth.player?.display_name || auth.player?.name}
      />

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={home} />
          <Route path="/joueur/:name" element={<PlayerProfile games={games} stats={stats} profiles={profiles} />} />
          <Route path="/profils" element={<PlayersIndex ranked={ranked} profiles={profiles} />} />
          <Route path="/trophees" element={<TrophiesPage stats={stats} profiles={profiles} />} />
          <Route path="/xp" element={<XpGuide />} />
          <Route path="/rangs" element={<RankGuide />} />
          <Route path="/tournois" element={<Tournois profiles={profiles} />} />
          <Route path="/ligues" element={<Leagues knownPlayers={knownPlayers} />} />
          <Route path="/palmares" element={<Palmares />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<MyProfile />} />
          <Route path="/admin" element={<Admin />} />
          {/* Référence interne du design system : non listée dans la navigation. */}
          <Route path="/styleguide" element={<Styleguide />} />
          <Route path="*" element={home} />
        </Routes>
      </Suspense>

      <footer className="footer shell">
        <span>DartsCounter — La Ligue</span>
        <a href="https://github.com/mokakejr/DartsCounter-" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>

      <BottomTabs tournamentsBadge={openTournaments} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <AppInner />
      </LeagueProvider>
    </AuthProvider>
  );
}
