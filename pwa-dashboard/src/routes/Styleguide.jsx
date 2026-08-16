import { useEffect, useState } from 'react';
import { SERIES } from '../components/ChartTheme.jsx';
import './Styleguide.css';

/**
 * Route non listée (/styleguide) — l'artefact de revue du chantier.
 *
 * On l'ouvre à côté de la maquette pour comparer. Elle rend chaque token,
 * chaque primitive et chaque état au même endroit, et surtout elle CALCULE le
 * contraste réel de chaque couleur sur le fond : la conformité n'est plus une
 * affirmation faite une fois dans un audit, elle est vérifiée à chaque
 * chargement. Une pastille rouge = un token sous 4,5:1 à corriger.
 */

const readVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function parseColor(value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return (rgb.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
}

function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const COLOR_GROUPS = [
  { title: 'Interface', tokens: ['--bg', '--surface', '--surface-2', '--border', '--text', '--muted', '--muted-2'] },
  { title: 'Accent', tokens: ['--accent', '--accent-ink'] },
  { title: 'Sémantique', tokens: ['--win', '--loss', '--hot', '--danger'] },
  { title: 'Données', tokens: ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7', '--cat-8'] },
  { title: 'Podium', tokens: ['--rank-1', '--rank-2', '--rank-3'] },
  { title: 'Rareté', tokens: ['--rar-common', '--rar-rare', '--rar-epic', '--rar-legendary'] },
  { title: 'Paliers Elo', tokens: ['--tier-bronze', '--tier-silver', '--tier-gold', '--tier-platinum', '--tier-diamond', '--tier-champion', '--tier-grand-champion'] },
];

// Les neutres ne sont pas censés porter du texte : on ne les note pas.
const NOT_TEXT = new Set(['--bg', '--surface', '--surface-2', '--border', '--accent-ink']);

const SPACING = ['--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6', '--sp-7', '--sp-8'];
const TYPE = ['--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl', '--fs-2xl', '--fs-3xl', '--fs-4xl'];
const RADII = ['--r-sm', '--r-md', '--r-lg', '--r-pill'];

export default function Styleguide() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const bg = parseColor(readVar('--bg'));
    setRows(
      COLOR_GROUPS.map((g) => ({
        ...g,
        items: g.tokens.map((t) => {
          const value = readVar(t);
          const ratio = contrast(parseColor(value), bg);
          return { token: t, value, ratio, scored: !NOT_TEXT.has(t) };
        }),
      }))
    );
  }, []);

  const failures = rows.flatMap((g) => g.items.filter((i) => i.scored && i.ratio < 4.5));

  return (
    <main className="sg shell">
      <header className="sg__head">
        <p className="eyebrow">Référence interne · non listée</p>
        <h1 className="display sg__title">Styleguide</h1>
        <p className="sg__lede">
          Chaque token, chaque primitive, chaque état. Les contrastes sont calculés
          au chargement sur le fond réel — ils ne sont pas recopiés d'un audit.
        </p>
        <p className={`sg__verdict${failures.length ? ' sg__verdict--bad' : ''}`}>
          {failures.length === 0
            ? 'Toutes les couleurs porteuses de texte passent 4,5:1.'
            : `${failures.length} token(s) sous 4,5:1 : ${failures.map((f) => f.token).join(', ')}`}
        </p>
      </header>

      {rows.map((group) => (
        <section key={group.title} className="sg__sec">
          <h2 className="sg__h2">{group.title}</h2>
          <div className="sg__swatches">
            {group.items.map((i) => (
              <div key={i.token} className="sg__sw">
                <span className="sg__sw-chip" style={{ background: `var(${i.token})` }} />
                <span className="sg__sw-token">{i.token}</span>
                <span className="sg__sw-value">{i.value}</span>
                <span className={`sg__sw-ratio${i.scored && i.ratio < 4.5 ? ' sg__sw-ratio--bad' : ''}`}>
                  {i.scored ? `${i.ratio.toFixed(2)}:1` : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="sg__sec">
        <h2 className="sg__h2">Espacement</h2>
        <div className="sg__spacers">
          {SPACING.map((t) => (
            <div key={t} className="sg__spacer">
              <i style={{ width: `var(${t})` }} />
              <code>{t}</code>
              <small>{readVar(t)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="sg__sec">
        <h2 className="sg__h2">Typographie</h2>
        {TYPE.map((t) => (
          <div key={t} className="sg__type">
            <code>{t}</code>
            <span style={{ fontSize: `var(${t})` }}>Gaétan règne sur la ligue</span>
            <small>{readVar(t)}</small>
          </div>
        ))}
      </section>

      <section className="sg__sec">
        <h2 className="sg__h2">Rayons</h2>
        <div className="sg__radii">
          {RADII.map((t) => (
            <div key={t} className="sg__radius" style={{ borderRadius: `var(${t})` }}>
              <code>{t}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="sg__sec">
        <h2 className="sg__h2">Primitives</h2>
        <div className="sg__grid">
          <div>
            <p className="eyebrow">Boutons — 48 px minimum</p>
            <div className="sg__stack">
              <button className="sg__btn sg__btn--primary">Jouer</button>
              <button className="sg__btn">Activer</button>
              <button className="sg__btn sg__btn--ghost">Annuler</button>
              <button className="sg__btn sg__btn--danger">Supprimer</button>
              <button className="sg__btn" disabled>Indisponible</button>
            </div>
          </div>
          <div>
            <p className="eyebrow">Chips</p>
            <div className="sg__row">
              <span className="sg__chip sg__chip--on">Global</span>
              <span className="sg__chip">Cricket</span>
              <span className="sg__chip">Shanghai</span>
            </div>
            <p className="eyebrow sg__mt">Sémantique</p>
            <div className="sg__row">
              <span style={{ color: 'var(--win)' }}>Victoire</span>
              <span style={{ color: 'var(--loss)' }}>Défaite</span>
              <span style={{ color: 'var(--hot)' }}>🔥 Série</span>
              <span style={{ color: 'var(--danger)' }}>Erreur</span>
            </div>
          </div>
          <div>
            <p className="eyebrow">Séries de données</p>
            <div className="sg__series">
              {SERIES.map((c, i) => (
                <span key={c} style={{ background: c }}>{i + 1}</span>
              ))}
            </div>
            <p className="eyebrow sg__mt">Focus clavier</p>
            <button className="sg__btn sg__btn--ghost">Tabuler jusqu'ici</button>
          </div>
        </div>
      </section>
    </main>
  );
}
