import { motion } from 'framer-motion';

// Scroll-in reveal: fades + lifts a block into view once. `delay` staggers
// siblings, `as` lets it wrap any element (default div).
export default function Reveal({ children, delay = 0, y = 22, className, as = 'div', ...rest }) {
  const M = motion[as] || motion.div;
  return (
    <M
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </M>
  );
}
