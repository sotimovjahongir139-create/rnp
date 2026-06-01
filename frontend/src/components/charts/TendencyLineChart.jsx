import { useEffect, useRef } from 'react';
import { svgEl, raf2 } from '../../utils/svgHelpers.js';

export default function TendencyLineChart({ months = [], values = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !months.length) return;
    svg.innerHTML = '';

    const W = 900, H = 200, pt = 22, pr = 24, pb = 44, pl = 52;
    const cW = W - pl - pr, cH = H - pt - pb;
    const baseY = pt + cH;
    const maxV = Math.max(...values, 1);
    const sx = (i) => pl + (i / (months.length - 1)) * cW;
    const sy = (v) => baseY - (v / maxV) * cH;

    const pts = months.map((_, i) => ({ x: sx(i), y: sy(values[i]) }));

    [0, 25, 50, 75, 100].forEach((t) => {
      const y = sy(t);
      if (y < pt - 5) return;
      svg.appendChild(svgEl('line', { x1: pl, y1: y, x2: pl + cW, y2: y, stroke: '#E2DDD4', 'stroke-width': '1', 'stroke-dasharray': '4 3' }));
      const tx = svgEl('text', { x: pl - 6, y: y + 4, 'text-anchor': 'end', fill: '#8CA496', 'font-size': '9', 'font-family': 'Plus Jakarta Sans' });
      tx.textContent = t + '%';
      svg.appendChild(tx);
    });

    // Area fill
    let areaD = `M${pts[0].x},${baseY} L${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      areaD += ` C${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    areaD += ` L${pts[pts.length - 1].x},${baseY} Z`;
    svg.appendChild(svgEl('path', { d: areaD, fill: 'rgba(52,195,119,0.08)', stroke: 'none' }));

    // Line
    let lineD = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      lineD += ` C${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    const linePath = svgEl('path', { d: lineD, fill: 'none', stroke: '#34C377', 'stroke-width': '2.5', 'stroke-linecap': 'round' });
    const len = 2000;
    linePath.setAttribute('stroke-dasharray', len);
    linePath.setAttribute('stroke-dashoffset', len);
    svg.appendChild(linePath);

    // Dots and labels
    pts.forEach((p, i) => {
      const dot = svgEl('circle', { cx: p.x, cy: p.y, r: 4.5, fill: '#34C377', stroke: '#fff', 'stroke-width': '2', opacity: '0' });
      svg.appendChild(dot);

      if (values[i] > 0) {
        const vt = svgEl('text', { x: p.x, y: p.y - 12, 'text-anchor': 'middle', fill: '#287D4F', 'font-size': '10', 'font-weight': '800', 'font-family': 'Plus Jakarta Sans', opacity: '0' });
        vt.textContent = values[i] + '%';
        svg.appendChild(vt);
        setTimeout(() => { vt.setAttribute('opacity', '1'); vt.style.transition = 'opacity 0.4s'; }, 900 + i * 120);
      }

      const mx = svgEl('text', { x: p.x, y: baseY + 18, 'text-anchor': 'middle', fill: '#475E54', 'font-size': '10', 'font-weight': '600', 'font-family': 'Plus Jakarta Sans' });
      mx.textContent = months[i];
      svg.appendChild(mx);

      setTimeout(() => { dot.setAttribute('opacity', '1'); dot.style.transition = 'opacity 0.3s'; }, 800 + i * 100);
    });

    raf2(() => {
      linePath.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)';
      linePath.setAttribute('stroke-dashoffset', '0');
    });
  }, [months, values]);

  return (
    <svg ref={ref} width="100%" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }} />
  );
}
