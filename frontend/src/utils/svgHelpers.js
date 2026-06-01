const NS = 'http://www.w3.org/2000/svg';

export const svgEl = (tag, attrs = {}, inner = null) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (inner !== null) el.innerHTML = inner;
  return el;
};

export const raf2 = (fn) =>
  requestAnimationFrame(() => requestAnimationFrame(fn));

export const rafAnim = (from, to, dur, delay, cb) => {
  const t0 = performance.now() + delay;
  const tick = (now) => {
    if (now < t0) { requestAnimationFrame(tick); return; }
    const p = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    cb(from + (to - from) * e, p >= 1);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
