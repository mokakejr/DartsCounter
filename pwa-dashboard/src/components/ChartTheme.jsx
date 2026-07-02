import './ChartTheme.css';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
export const GRID = '#26262B';
export const TICK = '#8A8A8E';

export function ChartTooltip({ active, payload, label, suffix }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      {label != null && <div className="tt__label">{suffix ? `${suffix} ${label}` : label}</div>}
      {payload.map(p => (
        <div key={p.name} className="tt__row">
          <span className="tt__dot" style={{ background: p.color || p.payload?.fill }} />
          {p.name} : <b>{p.value}</b>
        </div>
      ))}
    </div>
  );
}
