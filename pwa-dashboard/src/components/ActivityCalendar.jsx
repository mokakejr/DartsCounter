import { useMemo } from 'react';
import './ActivityCalendar.css';

const DAY_MS = 86400000;
const WEEKS = 53;
const WEEKDAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// Un jour local en clé YYYY-MM-DD (le bucketing suit le fuseau du navigateur,
// comme le reste des stats côté client).
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Intensité 0..4 : 0 = rien, puis paliers de parties jouées ce jour-là.
function level(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function buildCalendar(games, name) {
  // Comptage par jour des parties du joueur.
  const perDay = {};
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const g of games) {
    if (!(g.players || []).includes(name)) continue;
    const d = new Date(g.date);
    const k = dayKey(d);
    perDay[k] = (perDay[k] || 0) + 1;
    perWeekday[d.getDay()] += 1;
  }

  // Grille : 53 semaines glissantes, colonnes = semaines, lignes = jours
  // (dim→sam). On finit sur la semaine courante (à droite), alignée au dimanche.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today.getTime() - today.getDay() * DAY_MS); // dimanche de cette semaine
  const start = new Date(end.getTime() - (WEEKS - 1) * 7 * DAY_MS);

  const weeks = [];
  const activeWeeks = []; // semaine (index) → a joué au moins une fois
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    let weekHasPlay = false;
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
      const future = date > today;
      const count = future ? 0 : (perDay[dayKey(date)] || 0);
      if (count > 0) weekHasPlay = true;
      col.push({ key: dayKey(date), date, count, level: level(count), future });
    }
    weeks.push(col);
    activeWeeks.push(weekHasPlay);
  }

  // Stats.
  const joursActifs = Object.keys(perDay).length;
  const recordEnJour = Object.values(perDay).reduce((m, v) => Math.max(m, v), 0);
  const favIdx = perWeekday.reduce((best, v, i) => (v > perWeekday[best] ? i : best), 0);
  const jourFavori = joursActifs ? WEEKDAY_LABELS[favIdx] : '—';
  // Semaines d'affilée : suite de semaines actives se terminant à la semaine
  // courante (on remonte depuis la fin).
  let semainesDaffilee = 0;
  for (let w = WEEKS - 1; w >= 0 && activeWeeks[w]; w--) semainesDaffilee += 1;

  return {
    weeks,
    stats: { joursActifs, recordEnJour, jourFavori, semainesDaffilee },
  };
}

function fmtDay(date) {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Calendrier d'activité (F4) — style « contributions GitHub ». Un carré par
 * jour sur 12 mois glissants, intensité = parties jouées ce jour-là.
 *
 * INVARIANT : indépendant du filtre de saison. Il montre toujours les 12
 * derniers mois — jamais la fenêtre de la saison sélectionnée. Le prochain
 * mainteneur voudra le câbler au contexte de saison : ne pas le faire (cf. le
 * test activity-calendar). C'est la régularité de jeu qui se lit ici, pas la
 * performance d'une saison.
 */
export default function ActivityCalendar({ games, name, onPickDay }) {
  const { weeks, stats } = useMemo(() => buildCalendar(games, name), [games, name]);

  return (
    <div className="cal">
      <div className="cal__grid" role="img" aria-label="Calendrier d'activité sur 12 mois">
        {weeks.map((col, w) => (
          <div key={w} className="cal__week">
            {col.map(cell => (
              <button
                key={cell.key}
                type="button"
                className={`cal__cell cal__cell--l${cell.level}${cell.future ? ' cal__cell--future' : ''}`}
                title={cell.future ? '' : `${fmtDay(cell.date)} · ${cell.count} partie${cell.count > 1 ? 's' : ''}`}
                disabled={cell.future || !onPickDay}
                onClick={() => onPickDay && onPickDay(cell)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="cal__foot">
        <div className="cal__stats">
          <span><b>{stats.semainesDaffilee}</b> semaines d'affilée</span>
          <span><b>{stats.jourFavori}</b> jour favori</span>
          <span><b>{stats.recordEnJour}</b> record en 1 jour</span>
          <span><b>{stats.joursActifs}</b> jours actifs</span>
        </div>
        <div className="cal__legend" aria-hidden="true">
          <span>moins</span>
          <span className="cal__cell cal__cell--l0" />
          <span className="cal__cell cal__cell--l1" />
          <span className="cal__cell cal__cell--l2" />
          <span className="cal__cell cal__cell--l3" />
          <span className="cal__cell cal__cell--l4" />
          <span>plus</span>
        </div>
      </div>
    </div>
  );
}
