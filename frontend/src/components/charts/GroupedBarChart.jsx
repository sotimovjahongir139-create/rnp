import { useEffect, useRef } from 'react';
import { svgEl, raf2, rafAnim } from '../../utils/svgHelpers.js';

export default function GroupedBarChart({ data = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !data.length) return;
    svg.innerHTML = '';

    const W = 540, H = 210, pt = 18, pr = 18, pb = 38, pl = 70;
    const cW = W - pl - pr, cH = H - pt - pb;
    const maxV = Math.max(...data.flatMap((d) => [d.k, d.b]), 1);
    const sy = (v) => (v / maxV) * cH;
    const gW = cW / data.length;
    const bW = gW * 0.28;

    [0, 5, 10, 15, 20, 25].forEach((t) => {
      const y = pt + cH - sy(t);
      svg.appendChild(svgEl('line', { x1: pl, y1: y, x2: pl + cW, y2: y, stroke: '#E2DDD4', 'stroke-width': '1', 'stroke-dasharray': '4 3' }));
      const tx = svgEl('text', { x: pl - 5, y: y + 4, 'text-anchor': 'end', fill: '#8CA496', 'font-size': '9', 'font-family': 'Plus Jakarta Sans' });
      tx.textContent = t;
      svg.appendChild(tx);
    });

    svg.appendChild(svgEl('line', { x1: pl, y1: pt, x2: pl, y2: pt + cH, stroke: '#B4B0A8', 'stroke-width': '1.5' }));
    svg.appendChild(svgEl('line', { x1: pl, y1: pt + cH, x2: pl + cW, y2: pt + cH, stroke: '#B4B0A8', 'stroke-width': '1.5' }));

    const barEls = [];
    data.forEach((d, i) => {
      const gX = pl + i * gW + gW / 2;
      const cx = pt + cH;

      const lbl = svgEl('text', { x: gX, y: cx + 14, 'text-anchor': 'middle', fill: '#475E54', 'font-size': '9.5', 'font-weight': '600', 'font-family': 'Plus Jakarta Sans' });
      lbl.textContent = d.name.split(' ')[0];
      svg.appendChild(lbl);

      const barK = svgEl('rect', { x: gX - bW - 2, y: cx, width: bW, height: 0, rx: 3, fill: '#34C377', opacity: '0.85' });
      const barB = svgEl('rect', { x: gX + 2,       y: cx, width: bW, height: 0, rx: 3, fill: '#B5741A', opacity: '0.85' });
      svg.appendChild(barK);
      svg.appendChild(barB);

      const lblK = svgEl('text', { x: gX - bW / 2 - 2, y: cx - 3, 'text-anchor': 'middle', fill: '#287D4F', 'font-size': '8.5', 'font-weight': '700', 'font-family': 'Plus Jakarta Sans' });
      const lblB = svgEl('text', { x: gX + bW / 2 + 2,  y: cx - 3, 'text-anchor': 'middle', fill: '#7A4C00', 'font-size': '8.5', 'font-weight': '700', 'font-family': 'Plus Jakarta Sans' });
      svg.appendChild(lblK);
      svg.appendChild(lblB);

      barEls.push({ barK, barB, lblK, lblB, hK: sy(d.k), hB: sy(d.b), gX, bW, cx });
    });

    raf2(() => {
      barEls.forEach(({ barK, barB, lblK, lblB, hK, hB, gX, bW, cx }, i) => {
        rafAnim(0, hK, 800, i * 80, (v) => {
          barK.setAttribute('y', cx - v);
          barK.setAttribute('height', v);
          lblK.setAttribute('y', cx - v - 3);
        });
        rafAnim(0, hB, 800, i * 80 + 40, (v) => {
          barB.setAttribute('y', cx - v);
          barB.setAttribute('height', v);
          lblB.setAttribute('y', cx - v - 3);
        });
      });
      barEls.forEach(({ barK, barB, lblK, lblB, hK, hB }) => {
        lblK.textContent = Math.round((hK / (barK.ownerSVGElement?.clientHeight || 1)) * 25) || '';
        lblB.textContent = Math.round((hB / (barB.ownerSVGElement?.clientHeight || 1)) * 25) || '';
      });
      data.forEach((d, i) => {
        barEls[i].lblK.textContent = d.k;
        barEls[i].lblB.textContent = d.b;
      });
    });
  }, [data]);

  return (
    <svg ref={ref} width="100%" viewBox="0 0 540 210" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }} />
  );
}
