import { useState, useEffect } from 'react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import { usePolling } from '../../hooks/usePolling.js';
import KPICard from '../../components/cards/KPICard.jsx';
import DeptCard from '../../components/cards/DeptCard.jsx';
import GroupedBarChart from '../../components/charts/GroupedBarChart.jsx';
import CycleChart from '../../components/charts/CycleChart.jsx';
import TendencyLineChart from '../../components/charts/TendencyLineChart.jsx';
import { MODEL_LABELS } from '../../data/mockData.js';
import { fmt, effColor, holatBadge } from '../../utils/formatters.js';

export default function ProductionPage() {
  const { production, refreshProduction } = useDashboard();
  const [_, setTick] = useState(0);

  useEffect(() => { refreshProduction(); }, []);
  usePolling(() => { refreshProduction(); setTick((n) => n + 1); });

  if (!production?.kpi) return <div style={{ padding: 40, color: 'var(--t3)' }}>Yuklanmoqda...</div>;

  const { kpi, dept = [], weekly = [], cycle = [], tendency } = production;

  return (
    <>
      <div className="sec-head">
        <div className="sec-title">Ishlab chiqarish — Bolimlar holati</div>
      </div>

      <div className="kpi-grid">
        <KPICard label="Jami zakaz"      value={kpi.jamiZakaz}     sub={`${dept.length} bolim`} />
        <KPICard label="Jami kartochkalar" value={kpi.jamiKartochka} sub="faol kartochka" variant="gold" />
        <KPICard label="Bajarildi"        value={kpi.bajarildi}     sub={`${kpi.bajarildiPct}% umumiy`} />
        <KPICard label="Qoldi"            value={kpi.qoldi}         sub={`${kpi.qoldiPct}% qolmoqda`} variant="red" />
      </div>

      <div className="dept-grid">
        {dept.map((d) => <DeptCard key={d.name} dept={d} />)}
      </div>

      <div className="charts-row-3">
        <div className="chart-card">
          <div className="chart-title">Kirdi va Bajarildi — bolimlar boyicha</div>
          <div className="chart-sub">Haftalik kirish va bajarish holati</div>
          <div className="legend">
            <div className="leg-item"><div className="leg-dot" style={{ background: '#34C377' }}></div>Kirdi</div>
            <div className="leg-item"><div className="leg-dot" style={{ background: '#B5741A' }}></div>Bajarildi</div>
          </div>
          <GroupedBarChart data={weekly} />
        </div>

        <div className="chart-card">
          <div className="chart-title">Ortacha sikl vaqti (kun)</div>
          <div className="chart-sub">Bolimlar boyicha ishlov vaqti</div>
          <div className="legend">
            <div className="leg-item"><div className="leg-dot" style={{ background: '#287D4F' }}></div>≤2 kun</div>
            <div className="leg-item"><div className="leg-dot" style={{ background: '#C48000' }}></div>2–3 kun</div>
            <div className="leg-item"><div className="leg-dot" style={{ background: '#C03434' }}></div>3+ kun</div>
          </div>
          <CycleChart data={cycle} />
        </div>

        <div className="chart-card">
          <div className="chart-title">SKU — Mahsulot modellari</div>
          <div className="chart-sub">Bolimlar boyicha</div>
          <table className="sku-table">
            <thead><tr><th>Bo'lim</th><th>SKU / Model</th></tr></thead>
            <tbody>
              {(production.sku || []).map((row) => (
                <tr key={row.dept}>
                  <td className="sku-dept">{row.dept}</td>
                  <td className="pills-cell">
                    <div className="pills-inner">
                      {row.models.map((m) => (
                        <span key={m} className={`mpill ${MODEL_LABELS[m]?.cls}`}>
                          {MODEL_LABELS[m]?.label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tbl-card">
        <div className="tbl-head-row">
          <div className="chart-title">Bolimlar boyicha haftalik holat</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Bolim</th><th>Kirdi</th><th>Bajarildi</th>
              <th>Samaradorlik</th><th>Holat</th><th>Sikl vaqti</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map((r) => (
              <tr key={r.name}>
                <td className="td-name">{r.name}</td>
                <td>{r.k}</td>
                <td>{r.b}</td>
                <td>
                  <div className="eff-cell">
                    <div className="eff-track">
                      <div className="eff-fill" style={{ width: Math.min(r.eff, 100) + '%', background: effColor(r.eff) }} />
                    </div>
                    <span style={{ color: effColor(r.eff), fontWeight: 700, fontSize: '0.78rem' }}>{r.eff}%</span>
                  </div>
                </td>
                <td><span className={`tbl-badge ${holatBadge(r.holat)}`}>{r.holat}</span></td>
                <td className="mono" style={{ color: 'var(--t2)', fontSize: '0.78rem' }}>{r.sikl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tendency && (
        <div className="tbl-card">
          <div className="tbl-head-row">
            <div>
              <div className="chart-title">Ishlab chiqarish samaradorligi — Oylik tendensiya</div>
              <div className="chart-sub" style={{ marginBottom: 0 }}>So'nggi 6 oy boyicha dinamika</div>
            </div>
            <button className="trend-pill-btn">Tendensiya</button>
          </div>
          <TendencyLineChart months={tendency.months} values={tendency.values} />
          <div className="trend-badge-row">
            {tendency.badges.map((b) => (
              <div key={b.from} className={`trend-badge${b.type === 'amber' ? ' am-badge' : b.type === 'green' ? ' gr-badge' : ''}`}>
                <span className="trend-badge-lbl">{b.from}</span>
                <span className="trend-badge-val">{b.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
