import { useEffect, useState } from 'react';
import { animate } from 'framer-motion';

// Animated integer counter. Counts from 0 → `to` once, on mount/refresh.
export function useCountUp(to, duration = 1.1) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const controls = animate(0, to, {
      duration,
      ease: 'easeOut',
      onUpdate: v => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [to, duration]);
  return value;
}
