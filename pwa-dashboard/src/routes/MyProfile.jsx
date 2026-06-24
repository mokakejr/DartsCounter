import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { updateProfile, uploadImage } from '../api/players.js';
import './MyProfile.css';

export default function MyProfile() {
  const auth = useAuth();
  const p = auth.player;

  const [displayName, setDisplayName] = useState(p?.display_name ?? '');
  const [name, setName] = useState(p?.name ?? '');
  const [accentColor, setAccentColor] = useState(p?.accent_color ?? '#E61E2A');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [uploading, setUploading] = useState(null); // 'avatar' | 'flight' | null

  if (!auth.ready) return null;
  if (!p) return <Navigate to="/login" replace />;

  async function save(e) {
    e.preventDefault();
    if (password && password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: name.trim(),
        display_name: displayName.trim() || null,
        accent_color: accentColor,
      };
      if (password) payload.password = password;
      const updated = await updateProfile(auth.token, payload);
      auth.updatePlayer(updated);
      setPassword('');
      setNotice(password ? 'Profil et mot de passe mis à jour.' : 'Profil mis à jour.');
    } catch (err) {
      setError(err.status === 409 ? 'Ce nom est déjà pris.' : "Échec de l'enregistrement.");
    }
    setSaving(false);
  }

  async function onImage(slot, file) {
    if (!file) return;
    setUploading(slot);
    setError(null);
    try {
      const updated = await uploadImage(auth.token, slot, file);
      auth.updatePlayer(updated);
    } catch {
      setError("Échec de l'envoi de l'image.");
    }
    setUploading(null);
  }

  return (
    <div className="myprofile shell">
      <Link to="/" className="back">← La Ligue</Link>
      <h1 className="display myprofile__title">Mon profil</h1>

      <div className="myprofile__images">
        <div className="myprofile__image-slot">
          <div
            className="myprofile__avatar-preview"
            style={p.avatar_url ? { backgroundImage: `url(${p.avatar_url})` } : undefined}
          >
            {!p.avatar_url && p.name.charAt(0)}
          </div>
          <label className="myprofile__upload-btn">
            {uploading === 'avatar' ? 'Envoi…' : 'Changer la photo'}
            <input type="file" accept="image/*" hidden onChange={e => onImage('avatar', e.target.files[0])} />
          </label>
        </div>

        <div className="myprofile__image-slot">
          <div
            className="myprofile__flight-preview"
            style={p.flight_image_url ? { backgroundImage: `url(${p.flight_image_url})` } : undefined}
          >
            {!p.flight_image_url && '🎯'}
          </div>
          <label className="myprofile__upload-btn">
            {uploading === 'flight' ? 'Envoi…' : 'Flight de champion'}
            <input type="file" accept="image/*" hidden onChange={e => onImage('flight', e.target.files[0])} />
          </label>
          <p className="myprofile__hint">Visible sur la page d'accueil si tu es champion en titre.</p>
        </div>
      </div>

      <form className="myprofile__form" onSubmit={save}>
        <label className="myprofile__label">Nom d'utilisateur</label>
        <input
          className="myprofile__input"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={20}
        />

        <label className="myprofile__label">Nom affiché</label>
        <input
          className="myprofile__input"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          maxLength={40}
          placeholder={p.name}
        />

        <label className="myprofile__label">Couleur d'accent (page profil)</label>
        <input
          className="myprofile__color"
          type="color"
          value={accentColor}
          onChange={e => setAccentColor(e.target.value)}
        />

        <label className="myprofile__label">Nouveau mot de passe</label>
        <input
          className="myprofile__input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Laisser vide pour ne pas changer"
          autoComplete="new-password"
          minLength={8}
        />
        <p className="myprofile__hint">Tu utilises encore le mot de passe par défaut ? Change-le ici.</p>

        {error && <p className="myprofile__error">{error}</p>}
        {notice && <p className="myprofile__notice">{notice}</p>}

        <div className="myprofile__actions">
          <button type="button" className="myprofile__logout" onClick={auth.logout}>
            Déconnexion
          </button>
          <button type="submit" className="myprofile__save" disabled={saving || !name.trim()}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
