import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import './TrophyCard.css';

export default function TrophyCard({ trophy, delay = 0, onClick, showcase = false }) {
  const ref = useRef(null);

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateX = useSpring(0, { stiffness: 150, damping: 22 });
  const rotateY = useSpring(0, { stiffness: 150, damping: 22 });
  const gx = useTransform(mouseX, v => `${Math.round(v * 100)}%`);
  const gy = useTransform(mouseY, v => `${Math.round(v * 100)}%`);

  const handleMove = e => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    mouseX.set(nx);
    mouseY.set(ny);
    rotateX.set((ny - 0.5) * -16);
    rotateY.set((nx - 0.5) * 16);
  };

  const handleLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
    rotateX.set(0);
    rotateY.set(0);
  };

  const rarityKey = trophy.rarity?.key || (trophy.unlocked ? 'common' : null);
  const cls = [
    'tcard',
    rarityKey && `tcard--${rarityKey}`,
    !trophy.unlocked && 'tcard--locked',
    showcase && 'tcard--showcase',
  ].filter(Boolean).join(' ');

  return (
    <motion.button
      ref={ref}
      className={cls}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, delay: Math.min(delay, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
      {trophy.unlocked && rarityKey && (
        <motion.span className="tcard__foil" style={{ '--gx': gx, '--gy': gy }} />
      )}

      <span className="tcard__ico">{trophy.ico}</span>

      <span className="tcard__body">
        <span className="tcard__name">{trophy.name}</span>
        <span className="tcard__desc">{trophy.desc}</span>
        {!trophy.unlocked && trophy.progress && (
          <span className="tcard__prog">
            <span className="tcard__prog-track">
              <motion.span
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: delay + 0.3, ease: 'easeOut' }}
                style={{
                  transformOrigin: 'left',
                  width: `${Math.round((trophy.progress[0] / trophy.progress[1]) * 100)}%`,
                }}
              />
            </span>
            <span className="tcard__prog-num">{trophy.progress[0]}/{trophy.progress[1]}</span>
          </span>
        )}
      </span>

      {!trophy.unlocked && (
        <span className="tcard__lock" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </span>
      )}

      {trophy.unlocked && trophy.rarity && (
        <span className="tcard__rar" style={{ color: trophy.rarity.color }}>●</span>
      )}
    </motion.button>
  );
}
