import { useEffect, useRef } from 'react';
import { rafAnim } from '../utils/svgHelpers';
import { fmt } from '../utils/formatters';

export function useAnimatedCounter(ref, target, duration = 1100) {
  useEffect(() => {
    if (!ref.current || target == null) return;
    rafAnim(0, target, duration, 0, (v) => {
      if (ref.current) ref.current.textContent = fmt(v);
    });
  }, [target]);
}
