import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { modeDistribution } from '../lib/derive.js';
import { MODE_LABEL, fmtDuration } from '../lib/data.js';
import { fetchPlayerEloHistory } from '../api/players.js';
import { SERIES, GRID, TICK, ChartTooltip } from '../components/ChartTheme.jsx';
import { playerColor } from '../lib/playerColors.js';
import { useAuth } from '../lib/useAuth.jsx';
import './Trends.css';

const fmtTick = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export default function Trends({ games, ranked }) {
  const auth = useAuth();
  // Moi = toujours le rouge primaire ; les autres = couleur hashée stable
  // (Epic 2.3) — plus de palette par index qui change à chaque reclassement.
  const colorOf = (name) => playerColor(name, auth?.player?.name);
  const dist = useMemo(() => modeDistribution(games), [games]);
  // Top 5 players keep the chart readable + matches the 5-tone series scale.
  const top = useMemo(() => ranked.slice(0, 5).map(s => s.name), [ranked]);
  const [eloData, setEloData] = useState([]);

  // ponytail: 5 parallel GETs; bulk /elo/history?players= endpoint if top-N grows.
  useEffect(() => {
    if (!top.length) { setEloData([]); return; }
    let cancelled = false;
    Promise.all(
      top.map(name => fetchPlayerEloHistory(name, 'global').catch(() => []))
    ).then(histories => {
      if (cancelled) return;
      // Align by game date: one row per date any of the top players moved;
      // connectNulls on the lines bridges the games they sat out.
      const byDate = new Map();
      histories.forEach((rows, i) => {
        for (const r of rows) {
          const row = byDate.get(r.game_date) ?? { t: r.game_date };
          row[top[i]] = r.elo_after;
          byDate.set(r.game_date, row);
        }
      });
      setEloData([...byDate.values()].sort((a, b) => new Date(a.t) - new Date(b.t)));
    });
    return () => { cancelled = true; };
  }, [top]);

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
          <h3 className="card__title">Course à l'ELO</h3>
          <div className="card__chart">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={eloData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="t" stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} tickFormatter={fmtTick} />
                <YAxis domain={['auto', 'auto']} stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} labelFormatter={fmtTick} />
                {top.map((p, i) => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={colorOf(p)}
                    strokeWidth={p === auth?.player?.name ? 3 : 2}
                    strokeDasharray={i > 2 ? '5 4' : undefined}
                    dot={false}
                    connectNulls
                    isAnimationActive
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="legend">
            {top.map((p) => (
              <li key={p}>
                <span className="legend__dot" style={{ background: colorOf(p) }} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
