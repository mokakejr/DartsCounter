import { useState, useEffect } from 'react';

export default function ElapsedTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const s = Math.floor(elapsed / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <span style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>
      {mm}:{ss}
    </span>
  );
}
