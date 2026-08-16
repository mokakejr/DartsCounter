import './ChartTheme.css';

// Échelle catégorielle partagée (shared/design/tokens.css). Remplace l'ancienne
// --series-*, dérivée du rouge de marque : deux de ses cinq niveaux tombaient à
// 2,78:1 et 1,78:1 sur le fond, donc invisibles. Les huit teintes ici sont
// toutes ≥ 4,5:1 et distinctes en teinte, pas seulement en luminosité.
export const SERIES = [
  'var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)',
  'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)',
];

export const GRID = 'var(--border)';
export const TICK = 'var(--muted)';

/**
 * Couleur de la i-ème catégorie. Passer `total` pour être averti quand il y a
 * plus de catégories que de couleurs : l'ancien `SERIES[i % SERIES.length]`
 * recyclait en silence dès le 6e mode, si bien que deux modes différents
 * recevaient la même couleur et que la légende mentait.
 */
export function seriesColor(index, total = 0) {
  if (import.meta.env.DEV && total > SERIES.length) {
    console.warn(
      `[ChartTheme] ${total} catégories pour ${SERIES.length} couleurs : ` +
      `les couleurs vont se répéter. Regroupez la queue en « Autres ».`
    );
  }
  return SERIES[index % SERIES.length];
}

export function ChartTooltip({ active, payload, label, suffix, labelFormatter }) {
  if (!active || !payload?.length) return null;
  const shown = label != null && labelFormatter ? labelFormatter(label) : label;
  return (
    <div className="tt">
      {shown != null && <div className="tt__label">{suffix ? `${suffix} ${shown}` : shown}</div>}
      {payload.map(p => (
        <div key={p.name} className="tt__row">
          <span className="tt__dot" style={{ background: p.color || p.payload?.fill }} />
          {p.name} : <b>{p.value}</b>
        </div>
      ))}
    </div>
  );
}
