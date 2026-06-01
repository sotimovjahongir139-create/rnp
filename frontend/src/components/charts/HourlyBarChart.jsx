import { useEffect, useRef } from 'react';
import { svgEl, raf2, rafAnim } from '../../utils/svgHelpers.js';

export default function HourlyBarChart({ data = [], svgId }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !data.length) return;
    svg.innerHTML = '';

    const W = 300, H = 195, pt = 8, pr = 44, pb = 14, pl = 54;
    const cW = W - pl - pr, cH = H - pt - pb;
    const maxV = Math.max(...data.map((d) => d.v), 1);
    const sx = (v) => (v / maxV) * cW;
    const rowH = cH / data.length;

    svg.appendChild(svgEl('line', { x1: pl, y1: pt, x2: pl, y2: pt + cH, stroke: '#B4B0A8', 'stroke-width': '1.5' }));

    const barEls = [];
    data.forEach((d, i) => {
      const cy = pt + i * rowH + rowH / 2;
      const bH = rowH * 0.52;
      const bY = cy - bH / 2;
      const isMax = d.v === maxV;
      const col = isMax ? '#287D4F' : '#34C377';

      const lbl = svgEl('text', { x: pl - 6, y: cy + 4, 'text-anchor': 'end', fill: '#475E54', 'font-size': '9', 'font-weight': '500', 'font-family': 'Plus Jakarta Sans' });
      lbl.textContent = d.lbl;
      svg.appendChild(lbl);

      const bar = svgEl('rect', { x: pl, y: bY, width: 0, height: bH, rx: 3, fill: col, opacity: isMax ? '1' : '0.78' });
      svg.appendChild(bar);

      const vt = svgEl('text', { x: pl + 4, y: cy + 4, fill: '#475E54', 'font-size': '9', 'font-weight': '700', 'font-family': 'Plus Jakarta Sans' });
      vt.textContent = d.v;
      svg.appendChild(vt);
      barEls.push({ el: bar, vt, w: sx(d.v) });
    });

    raf2(() => {
      barEls.forEach(({ el, vt, w }, i) => {
        rafAnim(0, w, 850, i * 75, (v) => {
          el.setAttribute('width', v);
          vt.setAttribute('x', pl + v + 4);
        });
      });
    });
  }, [data]);

  return (
    <svg
      ref={ref}
      id={svgId}
      width="100%"
      viewBox="0 0 300 195"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    />
  );
}
