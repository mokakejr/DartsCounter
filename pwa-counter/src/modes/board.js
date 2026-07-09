// Dartboard geometry + scoring (pure, node-testable) — the logic behind
// <SvgBoard /> (Epic 4). No DOM here.

// Standard clockwise sector order, 20 at the top.
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export const BULL = 25;

// Radii in viewBox units (viewBox is -110..110).
export const RADII = {
  innerBull: 7,
  outerBull: 16,
  tripleInner: 54,
  tripleOuter: 64,
  doubleInner: 88,
  doubleOuter: 98,
  rim: 110,
};

export const SECTOR_ANGLE = 360 / SECTORS.length; // 18°

// Points for a hit. ring: 'S' | 'D' | 'T' | 'BULL' | 'DBULL' | 'MISS'.
export function hitPoints({ value, ring }) {
  switch (ring) {
    case 'S': return value;
    case 'D': return value * 2;
    case 'T': return value * 3;
    case 'BULL': return 25;
    case 'DBULL': return 50;
    default: return 0;
  }
}

export function hitLabel({ value, ring }) {
  switch (ring) {
    case 'S': return String(value);
    case 'D': return `D${value}`;
    case 'T': return `T${value}`;
    case 'BULL': return '25';
    case 'DBULL': return 'BULL';
    default: return 'MISS';
  }
}

// Angle (degrees) of the middle of sector i, 0 = up, clockwise.
export function sectorMidAngle(i) {
  return i * SECTOR_ANGLE;
}

function polar(angleDeg, r) {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // 0° = up
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

// SVG path of the annular wedge for sector index i between radii r0 < r1.
export function sectorPath(i, r0, r1) {
  const a0 = sectorMidAngle(i) - SECTOR_ANGLE / 2;
  const a1 = sectorMidAngle(i) + SECTOR_ANGLE / 2;
  const [x0o, y0o] = polar(a0, r1);
  const [x1o, y1o] = polar(a1, r1);
  const [x0i, y0i] = polar(a0, r0);
  const [x1i, y1i] = polar(a1, r0);
  const fmt = n => n.toFixed(3);
  return (
    `M ${fmt(x0o)} ${fmt(y0o)} ` +
    `A ${fmt(r1)} ${fmt(r1)} 0 0 1 ${fmt(x1o)} ${fmt(y1o)} ` +
    `L ${fmt(x1i)} ${fmt(y1i)} ` +
    `A ${fmt(r0)} ${fmt(r0)} 0 0 0 ${fmt(x0i)} ${fmt(y0i)} Z`
  );
}

// Classify a point (viewBox coords) into a hit — used for tests and as the
// single source of truth for what each region means.
export function hitAt(x, y) {
  const r = Math.hypot(x, y);
  if (r <= RADII.innerBull) return { value: BULL, ring: 'DBULL' };
  if (r <= RADII.outerBull) return { value: BULL, ring: 'BULL' };
  if (r > RADII.doubleOuter) return { value: 0, ring: 'MISS' };

  let angle = (Math.atan2(y, x) * 180) / Math.PI + 90; // 0 = up
  angle = ((angle % 360) + 360) % 360;
  const i = Math.round(angle / SECTOR_ANGLE) % SECTORS.length;
  const value = SECTORS[i];

  if (r >= RADII.tripleInner && r <= RADII.tripleOuter) return { value, ring: 'T' };
  if (r >= RADII.doubleInner) return { value, ring: 'D' };
  return { value, ring: 'S' };
}
