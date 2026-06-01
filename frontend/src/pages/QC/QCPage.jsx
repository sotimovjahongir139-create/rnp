import { useEffect, useRef } from 'react';
import KPICard        from '../../components/cards/KPICard.jsx';
import CategoryChart  from '../../components/charts/CategoryChart.jsx';
import { svgEl, raf2 } from '../../utils/svgHelpers.js';
import {
  QC_KPI, QC_TREND, QC_TOP_MODELS, QC_SABABLARI, QC_TOP10,
} from '../../data/mockData.js';

// ── Brak trend line (absolute counts, red palette) ────────────
function BrakTrendChart({ months, values }) {
  const ref = useRef(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !months.length) return;
    svg.innerHTML = '';

    const W = 900, H = 200, pt = 22, pr = 24, pb = 44, pl = 52;
    const cW = W - pl - pr, cH = H - pt - pb;
    const baseY = pt + cH;
    const maxV  = Math.max(...values, 1);
    const sx = (i) => pl + (i / (months.length - 1)) * cW;
    const sy = (v) => baseY - (v / maxV) * cH;
    const pts = months.map((_, i) => ({ x: sx(i), y: sy(values[i]) }));

    // grid
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const tick = Math.round(maxV * t);
      const y = sy(tick);
      if (y < pt - 5) return;
      svg.appendChild(svgEl('line', { x1: pl, y1: y, x2: pl + cW, y2: y, stroke: '#E2DDD4', 'stroke-width': '1', 'stroke-dasharray': '4 3' }));
      const tx = svgEl('text', { x: pl - 6, y: y + 4, 'text-anchor': 'end', fill: '#8CA496', 'font-size': '9', 'font-family': 'Plus Jakarta Sans' });
      tx.textContent = tick;
      svg.appendChild(tx);
    });

    // axes
    svg.appendChild(svgEl('line', { x1: pl, y1: pt, x2: pl, y2: baseY, stroke: '#B4B0A8', 'stroke-width': '1.5' }));
    svg.appendChild(svgEl('line', { x1: pl, y1: baseY, x2: pl + cW, y2: baseY, stroke: '#B4B0A8', 'stroke-width': '1.5' }));

    // area
    let areaD = `M${pts[0].x},${baseY} L${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      areaD += ` C${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    areaD += ` L${pts[pts.length - 1].x},${baseY} Z`;
    svg.appendChild(svgEl('path', { d: areaD, fill: 'rgba(192,52,52,0.07)', stroke: 'none' }));

    // line
    let lineD = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      lineD += ` C${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    const linePath = svgEl('path', { d: lineD, fill: 'none', stroke: '#C03434', 'stroke-width': '2.5', 'stroke-linecap': 'round' });
    linePath.setAttribute('stroke-dasharray', '2000');
    linePath.setAttribute('stroke-dashoffset', '2000');
    svg.appendChild(linePath);

    // dots, value labels, month labels
    pts.forEach((p, i) => {
      const dot = svgEl('circle', { cx: p.x, cy: p.y, r: 4.5, fill: '#C03434', stroke: '#fff', 'stroke-width': '2', opacity: '0' });
      svg.appendChild(dot);

      if (values[i] > 0) {
        const vt = svgEl('text', { x: p.x, y: p.y - 12, 'text-anchor': 'middle', fill: '#C03434', 'font-size': '10', 'font-weight': '800', 'font-family': 'Plus Jakarta Sans', opacity: '0' });
        vt.textContent = values[i];
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

  return <svg ref={ref} width="100%" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }} />;
}

// ── Donut chart ───────────────────────────────────────────────
function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.v, 0);
  const cx = 100, cy = 100, R = 70, r = 44;
  let angle = -Math.PI / 2;

  const slices = data.map((d) => {
    const sweep = (d.v / total) * 2 * Math.PI;
    const end   = angle + sweep;
    const x1 = cx + R * Math.cos(angle),  y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(end),    y2 = cy + R * Math.sin(end);
    const x3 = cx + r * Math.cos(end),    y3 = cy + r * Math.sin(end);
    const x4 = cx + r * Math.cos(angle),  y4 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const path  = `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${r},${r} 0 ${large},0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
    angle = end;
    return { ...d, path };
  });

  return (
    <div className="qc-donut-wrap">
      <svg viewBox="0 0 200 200" width="175" height="175" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.c} opacity="0.9" />)}
        <text x={cx} y={cy - 7}  textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--t1)" fontFamily="Plus Jakarta Sans">{total}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9"  fill="var(--t3)" fontFamily="Plus Jakarta Sans">jami nuqson</text>
      </svg>
      <div className="qc-donut-legend">
        {data.map((d, i) => (
          <div key={i} className="qc-leg-row">
            <div className="qc-leg-dot" style={{ background: d.c }} />
            <span className="qc-leg-lbl">{d.lbl}</span>
            <span className="qc-leg-val">{d.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ranked list ───────────────────────────────────────────────
const RANK_COLS = ['#E05050', '#E07040', '#C48000', '#3B6FD4', '#7B5EA7', '#287D4F', '#34C377'];

function RankedList({ items }) {
  const max = Math.max(...items.map((r) => r.v), 1);
  return (
    <div className="qc-ranked">
      {items.map((r, i) => (
        <div key={r.rank} className="qc-rank-row">
          <span className="qc-rank-num" style={{ color: i < 3 ? RANK_COLS[i] : 'var(--t3)' }}>
            {r.rank}
          </span>
          <div className="qc-rank-bar-wrap">
            <span className="qc-rank-model">{r.model}</span>
            <div className="qc-rank-track">
              <div
                className="qc-rank-fill"
                style={{ width: `${(r.v / max) * 100}%`, background: i < 3 ? RANK_COLS[i] : 'var(--green)' }}
              />
            </div>
          </div>
          <span className="qc-rank-v">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function QCPage() {
  return (
    <>
      <div className="sec-head">
        <div className="sec-title">Sifat nazorati — Brak tahlili</div>
      </div>

      <div className="kpi-grid">
        <KPICard
          label="Bugungi nuqsonlar"
          value={QC_KPI.bugunNuqson}
          sub="jami nuqsonli birliklar"
          variant="red"
        />
        <KPICard
          label="Shu oyda"
          value={QC_KPI.oyNuqson}
          sub="oylik nuqson soni"
          variant="gold"
        />
        <KPICard
          label="Eng muammoli model"
          value={<span className="kpi-text-val warn">{QC_KPI.topModel}</span>}
          sub={`${QC_KPI.topModelCount} nuqson — shu oydagi eng ko'p`}
        />
        <KPICard
          label="Asosiy nuqson turi"
          value={<span className="kpi-text-val warn">{QC_KPI.topSabab}</span>}
          sub={`${QC_KPI.topSababCount} ta — eng ko'p uchraydigan sabab`}
          variant="red"
        />
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">Brak dinamikasi</div>
          <div className="chart-sub">So'nggi 6 oy</div>
          <BrakTrendChart months={QC_TREND.months} values={QC_TREND.values} />
          <div className="trend-badge-row">
            {QC_TREND.badges.map((b) => (
              <div
                key={b.from}
                className={`trend-badge${b.type === 'amber' ? ' am-badge' : b.type === 'green' ? ' gr-badge' : ''}`}
              >
                <span className="trend-badge-lbl">{b.from}</span>
                <span className="trend-badge-val">{b.val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Top 5 model</div>
          <div className="chart-sub">Taqsimot</div>
          <DonutChart data={QC_TOP_MODELS} />
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">Nuqson sabablari</div>
          <div className="chart-sub">Chastotasi bo'yicha</div>
          <CategoryChart data={QC_SABABLARI} />
        </div>

        <div className="chart-card">
          <div className="chart-title">Top 10 model reytingi</div>
          <div className="chart-sub">Jami nuqsonlar</div>
          <RankedList items={QC_TOP10} />
        </div>
      </div>
    </>
  );
}
