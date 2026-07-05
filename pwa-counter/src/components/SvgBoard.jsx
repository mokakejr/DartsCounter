import { useRef, useState } from 'react';
import { BULL, RADII, SECTORS, hitLabel, sectorPath, sectorMidAngle } from '../modes/board.js';
import { bigHit, smallHit, vibrate } from '../juice.js';
import './SvgBoard.css';

const DARK = '#1b1b1f';
const LIGHT = '#e8e0cf';
const RED = '#c81e2d';
const GREEN = '#1f7a4d';

function polar(angleDeg, r) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

/**
 * Le Dart-Wheel (Epic 4): cible SVG two-tap.
 * Tap 1 = secteur (hitbox pleine part, du bull au bord du double — pas de
 * visée fine au doigt) → le secteur s'illumine et un menu contextuel
 * apparaît sous le doigt. Tap 2 = Simple / Double / Triple (ou 25/50 sur le
 * bull). MISS = tap sur la couronne extérieure.
 *
 * props:
 *  - onHit({value, ring}) : fléchette validée
 *  - highlightTarget      : numéro (ou 25) mis en surbrillance rouge fluo,
 *                           le reste assombri (flow Shanghai, Epic 4.3)
 *  - interactive          : false = cible purement visuelle
 *  - darts                : [{value, ring}] fléchettes du tour, plantées en
 *                           marqueurs visuels
 */
export default function SvgBoard({ onHit, highlightTarget = null, interactive = true, darts = [] }) {
  const wrapRef = useRef(null);
  // { sector, x, y } — x/y en % du conteneur pour positionner l'overlay.
  const [picking, setPicking] = useState(null);

  function tapPoint(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function tapSector(e, value) {
    if (!interactive) return;
    vibrate(5);
    setPicking({ sector: value, ...tapPoint(e) });
  }

  function tapMiss() {
    if (!interactive) return;
    setPicking(null);
    smallHit();
    onHit?.({ value: 0, ring: 'MISS' });
  }

  function confirm(ring) {
    const hit = picking.sector === BULL
      ? { value: BULL, ring }
      : { value: picking.sector, ring };
    setPicking(null);
    if (ring === 'T' || ring === 'DBULL') bigHit();
    else smallHit();
    onHit?.(hit);
  }

  const dimmed = (value) => highlightTarget !== null && value !== highlightTarget;

  return (
    <div className="svgboard" ref={wrapRef}>
      <svg viewBox="-110 -110 220 220" className="svgboard__svg">
        {/* Couronne MISS */}
        <circle
          r={RADII.rim}
          fill="#0d0d10"
          onPointerDown={tapMiss}
        />

        {SECTORS.map((value, i) => {
          const dark = i % 2 === 0;
          const cls =
            `svgboard__sector` +
            (dimmed(value) ? ' svgboard__sector--dim' : '') +
            (highlightTarget === value ? ' svgboard__sector--target' : '') +
            (picking?.sector === value ? ' svgboard__sector--picked' : '');
          const ringFill = dark ? RED : GREEN;
          return (
            <g key={value} className={cls} onPointerDown={e => tapSector(e, value)}>
              <path d={sectorPath(i, RADII.outerBull, RADII.tripleInner)} fill={dark ? DARK : LIGHT} />
              <path d={sectorPath(i, RADII.tripleInner, RADII.tripleOuter)} fill={ringFill} />
              <path d={sectorPath(i, RADII.tripleOuter, RADII.doubleInner)} fill={dark ? DARK : LIGHT} />
              <path d={sectorPath(i, RADII.doubleInner, RADII.doubleOuter)} fill={ringFill} />
              {(() => {
                const [tx, ty] = polar(sectorMidAngle(i), 104);
                return (
                  <text x={tx} y={ty} className="svgboard__num" textAnchor="middle" dominantBaseline="central">
                    {value}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* Bull */}
        <g
          className={
            'svgboard__sector' +
            (dimmed(BULL) ? ' svgboard__sector--dim' : '') +
            (highlightTarget === BULL ? ' svgboard__sector--target' : '') +
            (picking?.sector === BULL ? ' svgboard__sector--picked' : '')
          }
          onPointerDown={e => tapSector(e, BULL)}
        >
          <circle r={RADII.outerBull} fill={GREEN} />
          <circle r={RADII.innerBull} fill={RED} />
        </g>

        {/* Fléchettes plantées ce tour */}
        {darts.map((d, i) => d.ring !== 'MISS' && (
          <DartMarker key={i} hit={d} />
        ))}
      </svg>

      {picking && (
        <div
          className="svgboard__picker"
          style={{ left: `${picking.x}%`, top: `${picking.y}%` }}
        >
          {picking.sector === BULL ? (
            <>
              <button className="svgboard__pick" onPointerDown={() => confirm('BULL')}>25</button>
              <button className="svgboard__pick svgboard__pick--t" onPointerDown={() => confirm('DBULL')}>50</button>
            </>
          ) : (
            <>
              <button className="svgboard__pick" onPointerDown={() => confirm('S')}>
                {picking.sector}
              </button>
              <button className="svgboard__pick svgboard__pick--d" onPointerDown={() => confirm('D')}>
                D{picking.sector}
              </button>
              <button className="svgboard__pick svgboard__pick--t" onPointerDown={() => confirm('T')}>
                T{picking.sector}
              </button>
            </>
          )}
          <button className="svgboard__pick svgboard__pick--x" onPointerDown={() => setPicking(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

// Fléchette virtuelle plantée dans le segment (Epic 4.4).
function DartMarker({ hit }) {
  const i = SECTORS.indexOf(hit.value);
  let r;
  if (hit.ring === 'DBULL') r = 0;
  else if (hit.ring === 'BULL') r = (RADII.innerBull + RADII.outerBull) / 2;
  else if (hit.ring === 'T') r = (RADII.tripleInner + RADII.tripleOuter) / 2;
  else if (hit.ring === 'D') r = (RADII.doubleInner + RADII.doubleOuter) / 2;
  else r = (RADII.outerBull + RADII.tripleInner) / 2;
  const [x, y] = hit.value === BULL || i === -1 ? [0, r] : polar(sectorMidAngle(i), r);
  return (
    <g className="svgboard__dart" transform={`translate(${x} ${y})`}>
      <circle r="3.4" fill="#ffd23c" stroke="#0d0d10" strokeWidth="1" />
    </g>
  );
}

export { hitLabel };
