import { useMemo } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { modeDistribution, winsOverTime } from '../lib/derive.js';
import { MODE_LABEL, fmtDuration } from '../lib/data.js';
import './Trends.css';

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
const GRID = '#26262B';
const TICK = '#8A8A8E';

function ChartTooltip({ active, payload, label, suffix }) {
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

export default function Trends({ games, ranked }) {
  const dist = useMemo(() => modeDistribution(games), [games]);
  // Top 5 players keep the chart readable + matches the 5-tone series scale.
  const top = useMemo(() => ranked.slice(0, 5).map(s => s.name), [ranked]);
  const { data } = useMemo(() => winsOverTime(games, top), [games, top]);

  // Durée moyenne d'une partie (sur les parties chronométrées).
  const avgDuration = useMemo(() => {
    const timed = games.filter(g => (g.duration || 0) > 0);
    if (!timed.length) return null;
    return timed.reduce((sum, g) => sum + g.duration, 0) / timed.length;
  }, [games]);

  return (
    <section className="trends shell" id="tendances">
      <div className="sec-head">
        <p className="eyebrow">03 — Tendances</p>
        <h2 className="display sec-title">Les tendances</h2>
        {avgDuration != null && (
          <p className="sec-note">Durée moyenne d'une partie · <b>{fmtDuration(avgDuration)}</b></p>
        )}
      </div>

      <div className="trends__grid">
        <div className="card">
          <h3 className="card__title">Répartition des modes</h3>
          <div className="card__chart">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={dist}
                  dataKey="value"
                  nameKey="mode"
                  innerRadius={62}
                  outerRadius={104}
                  paddingAngle={2}
                  stroke="none"
                >
                  {dist.map((d, i) => (
                    <Cell key={d.mode} fill={SERIES[i % SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="legend">
            {dist.map((d, i) => (
              <li key={d.mode}>
                <span className="legend__dot" style={{ background: SERIES[i % SERIES.length] }} />
                {MODE_LABEL[d.mode] || d.mode} <b>{d.value}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3 className="card__title">Course aux victoires</h3>
          <div className="card__chart">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="i" stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip suffix="Partie" />} />
                {top.map((p, i) => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={SERIES[i % SERIES.length]}
                    strokeWidth={2}
                    strokeDasharray={i > 2 ? '5 4' : undefined}
                    dot={false}
                    isAnimationActive
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="legend">
            {top.map((p, i) => (
              <li key={p}>
                <span className="legend__dot" style={{ background: SERIES[i % SERIES.length] }} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
