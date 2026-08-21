import './SeasonSelector.css';

/**
 * Sélecteur de saison (C6). Largeur constante quel que soit le nombre de mois :
 * deux mois en accès direct (dont la saison en cours), le reste dans un menu
 * « Mois précédents », et « Depuis toujours » au bout.
 * value : 'all' | <season id>. onChange(value).
 */
export default function SeasonSelector({ seasons = [], value = 'all', onChange }) {
  const sorted = [...seasons].sort((a, b) =>
    String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')),
  );
  const direct = sorted.slice(0, 2);
  const overflow = sorted.slice(2);

  const opt = (s, label) => (
    <button
      key={s.id}
      type="button"
      className={`seasonsel__opt${value === s.id ? ' is-on' : ''}`}
      onClick={() => onChange(s.id)}
    >
      {label ?? s.name}
    </button>
  );

  return (
    <div className="seasonsel">
      {direct.map((s) => opt(s, s.is_active ? `${s.name} · en cours` : s.name))}

      {overflow.length > 0 && (
        <details className="seasonsel__more">
          <summary className="seasonsel__opt">Mois précédents ▾</summary>
          <div className="seasonsel__menu">
            {overflow.map((s) => opt(s))}
          </div>
        </details>
      )}

      <button
        type="button"
        className={`seasonsel__opt${value === 'all' ? ' is-on' : ''}`}
        onClick={() => onChange('all')}
      >
        Depuis toujours
      </button>
    </div>
  );
}
