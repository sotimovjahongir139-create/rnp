import { useEffect, useRef } from 'react';
import { svgEl, raf2, rafAnim } from '../../utils/svgHelpers.js';

export default function CategoryChart({ data = [], svgId }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !data.length) return;
    svg.innerHTML = '';

    const W = 580, H = 220, pt = 16, pr = 70, pb = 36, pl = 158;
    const cW = W - pl - pr, cH = H - pt - pb;
    const maxV = Math.max(...data.map((d) => d.v), 1);
    const sx = (v) => (v / maxV) * cW;
    const rowH = cH / data.length;

    [0, 20, 40, 60, 80].forEach((t) => {
      const x = pl + sx(t);
      if (x > pl + cW + 5) return;
      svg.appendChild(svgEl('line', { x1: x, y1: pt, x2: x, y2: pt + cH, stroke: '#E2DDD4', 'stroke-width': '1', 'stroke-dasharray': '4 3' }));
      const tx = svgEl('text', { x, y: pt + cH + 14, 'text-anchor': 'middle', fill: '#8CA496', 'font-size': '9', 'font-family': 'Plus Jakarta Sans' });
      tx.textContent = t;
      svg.appendChild(tx);
    });

    svg.appendChild(svgEl('line', { x1: pl, y1: pt, x2: pl, y2: pt + cH, stroke: '#B4B0A8', 'stroke-width': '1.5' }));
    svg.appendChild(svgEl('line', { x1: pl, y1: pt + cH, x2: pl + cW, y2: pt + cH, stroke: '#B4B0A8', 'stroke-width': '1.5' }));

    const barEls = [];
    data.forEach((d, i) => {
      const cy = pt + i * rowH + rowH / 2;
      const bH = rowH * 0.5;
      const bY = cy - bH / 2;

      const lbl = svgEl('text', { x: pl - 8, y: cy + 4, 'text-anchor': 'end', fill: '#475E54', 'font-size': '10', 'font-weight': '500', 'font-family': 'Plus Jakarta Sans' });
      lbl.textContent = d.lbl;
      svg.appendChild(lbl);

      const bar = svgEl('rect', { x: pl, y: bY, width: 0, height: bH, rx: 4, fill: d.c, opacity: '0.88' });
      svg.appendChild(bar);

      const vtInner = d.pct
        ? `${d.v}<tspan fill="#C48000" font-size="8.5" font-weight="600"> (${d.pct})</tspan>`
        : null;
      const vt = svgEl('text', { x: pl + 4, y: cy + 4, fill: '#1A2822', 'font-size': '10', 'font-weight': '700', 'font-family': 'Plus Jakarta Sans' }, vtInner);
      if (!vtInner) vt.textContent = d.v;
      svg.appendChild(vt);

      barEls.push({ el: bar, vt, w: sx(d.v) });
    });

    raf2(() => {
      barEls.forEach(({ el, vt, w }, i) => {
        rafAnim(0, w, 900, i * 110, (v) => {
          el.setAttribute('width', v);
          vt.setAttribute('x', pl + v + 6);
        });
      });
    });
  }, [data]);

  return (
    <svg
      ref={ref}
      id={svgId}
      width="100%"
      viewBox="0 0 580 220"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    />
  );
}
