import { useEffect, useRef } from 'react';
import { svgEl, raf2, rafAnim } from '../../utils/svgHelpers.js';
import { cycleColor } from '../../utils/formatters.js';

export default function CycleChart({ data = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !data.length) return;
    svg.innerHTML = '';

    const W = 330, H = 210, pt = 18, pr = 18, pb = 38, pl = 58;
    const cW = W - pl - pr, cH = H - pt - pb;
    const maxV = Math.max(...data.map((d) => d.v), 4);
    const sy = (v) => (v / maxV) * cH;
    const bW = (cW / data.length) * 0.5;

    [0, 1, 2, 3, 4].forEach((t) => {
      const y = pt + cH - sy(t);
      svg.appendChild(svgEl('line', { x1: pl, y1: y, x2: pl + cW, y2: y, stroke: '#E2DDD4', 'stroke-width': '1', 'stroke-dasharray': '4 3' }));
      const tx = svgEl('text', { x: pl - 5, y: y + 4, 'text-anchor': 'end', fill: '#8CA496', 'font-size': '9', 'font-family': 'Plus Jakarta Sans' });
      tx.textContent = t;
      svg.appendChild(tx);
    });

    svg.appendChild(svgEl('line', { x1: pl, y1: pt, x2: pl, y2: pt + cH, stroke: '#B4B0A8', 'stroke-width': '1.5' }));
    svg.appendChild(svgEl('line', { x1: pl, y1: pt + cH, x2: pl + cW, y2: pt + cH, stroke: '#B4B0A8', 'stroke-width': '1.5' }));

    const gW = cW / data.length;
    const barEls = [];

    data.forEach((d, i) => {
      const cx = pl + i * gW + gW / 2;
      const by = pt + cH;
      const col = cycleColor(d.v);

      const lbl = svgEl('text', { x: cx, y: by + 14, 'text-anchor': 'middle', fill: '#475E54', 'font-size': '9', 'font-weight': '600', 'font-family': 'Plus Jakarta Sans' });
      lbl.textContent = d.name;
      svg.appendChild(lbl);

      const bar = svgEl('rect', { x: cx - bW / 2, y: by, width: bW, height: 0, rx: 4, fill: col, opacity: '0.9' });
      svg.appendChild(bar);

      if (d.v > 0) {
        const vt = svgEl('text', { x: cx, y: by - 5, 'text-anchor': 'middle', fill: col, 'font-size': '9.5', 'font-weight': '800', 'font-family': 'Plus Jakarta Sans' });
        vt.textContent = d.v;
        svg.appendChild(vt);
        barEls.push({ bar, vt, h: sy(d.v), by });
      } else {
        barEls.push({ bar, vt: null, h: 2, by });
      }
    });

    raf2(() => {
      barEls.forEach(({ bar, vt, h, by }, i) => {
        rafAnim(0, h, 800, i * 90, (v) => {
          bar.setAttribute('y', by - v);
          bar.setAttribute('height', v);
          if (vt) vt.setAttribute('y', by - v - 5);
        });
      });
    });
  }, [data]);

  return (
    <svg ref={ref} width="100%" viewBox="0 0 330 210" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }} />
  );
}
