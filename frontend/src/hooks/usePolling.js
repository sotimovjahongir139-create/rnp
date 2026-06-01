import { useEffect, useRef } from 'react';

const DEFAULT_INTERVAL = parseInt(import.meta.env.VITE_POLL_INTERVAL || '60000', 10);

export function usePolling(callback, interval = DEFAULT_INTERVAL, enabled = true) {
  const savedCb = useRef(callback);
  useEffect(() => { savedCb.current = callback; }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => savedCb.current(), interval);
    return () => clearInterval(id);
  }, [interval, enabled]);
}
