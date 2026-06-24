import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth.jsx';
import { updateProfile, uploadImage } from '../api/players.js';
import FlightEditor from '../components/FlightEditor.jsx';
import './MyProfile.css';

export default function MyProfile() {
  const auth = useAuth();
  const p = auth.player;

  const [displayName, setDisplayName] = useState(p?.display_name ?? '');
  const [name, setName] = useState(p?.name ?? '');
  const [accentColor, setAccentColor] = useState(p?.accent_color ?? '#E61E2A');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(null); // 'avatar' | 'flight' | null

  if (!auth.ready) return null;
  if (!p) return <Navigate to="/login" replace />;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(auth.token, {
        name: name.trim(),
        display_name: displayName.trim() || null,
        accent_color: accentColor,
      });
      auth.updatePlayer(updated);
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

  async function uploadFlightImage(file) {
    const updated = await uploadImage(auth.token, 'flight', file);
    auth.updatePlayer(updated);
    return updated;
  }

  async function saveFlightCrop({ flightCropA, flightCropB, flightMode }) {
    const updated = await updateProfile(auth.token, {
      flight_crop_a: flightCropA,
      flight_crop_b: flightCropB,
      flight_mode: flightMode,
    });
    auth.updatePlayer(updated);
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

        {error && <p className="myprofile__error">{error}</p>}

        <div className="myprofile__actions">
          <button type="button" className="myprofile__logout" onClick={auth.logout}>
            Déconnexion
          </button>
          <button type="submit" className="myprofile__save" disabled={saving || !name.trim()}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      </form>

      <section className="myprofile__flight-section">
        <p className="eyebrow">Mon dart</p>
        <p className="myprofile__hint">
          Visible sur la page d'accueil si tu es champion en titre, et sur ta page de profil.
        </p>
        <FlightEditor
          currentImageUrl={p.flight_image_url}
          currentCropA={p.flight_crop_a}
          currentCropB={p.flight_crop_b}
          currentMode={p.flight_mode}
          onUpload={uploadFlightImage}
          onSave={saveFlightCrop}
        />
      </section>
    </div>
  );
}
