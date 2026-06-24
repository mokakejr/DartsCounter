import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  // The leagues gate links here with ?mode=signup to open straight on sign-up.
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await auth.login(name.trim(), password);
      else await auth.signup(name.trim(), password);
      navigate(searchParams.get('next') || '/profile');
    } catch (err) {
      if (err.status === 401) setError('Nom ou mot de passe incorrect.');
      else if (err.status === 409) setError('Ce nom est déjà utilisé par un compte. Choisis-en un autre.');
      else if (err.status === 422) setError('Le mot de passe doit faire au moins 8 caractères.');
      else setError('Une erreur est survenue, réessaie.');
    }
    setBusy(false);
  }

  return (
    <div className="login shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display login__title">{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h1>
      <p className="login__sub">
        {mode === 'login'
          ? 'Connecte-toi pour gérer ton profil et utiliser la cloche.'
          : "Choisis un nom (existant ou nouveau) et un mot de passe — l'inscription n'est jamais requise pour jouer sur le compteur."}
      </p>

      <form className="login__form" onSubmit={submit}>
        <label className="login__label">Nom</label>
        <input
          className="login__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Léo"
          maxLength={20}
          autoFocus
          autoComplete="username"
        />

        <label className="login__label">Mot de passe</label>
        <input
          className="login__input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />

        {error && <p className="login__error">{error}</p>}

        <button type="submit" className="login__submit" disabled={busy || !name.trim() || !password}>
          {busy ? '…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>

      <button
        type="button"
        className="login__toggle"
        onClick={() => { setMode(m => (m === 'login' ? 'signup' : 'login')); setError(null); }}
      >
        {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
      </button>
    </div>
  );
}
