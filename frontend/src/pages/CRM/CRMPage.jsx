import { useState, useEffect, useRef } from 'react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import { usePolling } from '../../hooks/usePolling.js';
import KPICard from '../../components/cards/KPICard.jsx';
import TabBar from '../../components/layout/TabBar.jsx';
import HourlyBarChart from '../../components/charts/HourlyBarChart.jsx';
import CategoryChart from '../../components/charts/CategoryChart.jsx';

const CALL_TABS = [
  { id: 'oylik',  label: 'Oylik'  },
  { id: 'kunlik', label: 'Kunlik' },
];
const TG_TABS = [
  { id: 'tg-oylik',  label: 'Oylik'  },
  { id: 'tg-kunlik', label: 'Kunlik' },
];

export default function CRMPage() {
  const { crm, telegram, refreshCRM, refreshTelegram } = useDashboard();
  const [callTab, setCallTab] = useState('oylik');
  const [tgTab,   setTgTab]   = useState('tg-oylik');

  useEffect(() => { refreshCRM(); refreshTelegram(); }, []);
  usePolling(() => { refreshCRM(); refreshTelegram(); });

  if (!crm?.oylik) return <div style={{ padding: 40, color: 'var(--t3)' }}>Yuklanmoqda...</div>;

  const data   = callTab === 'oylik' ? crm.oylik  : crm.kunlik;
  const hourly = callTab === 'oylik' ? crm.hourly : crm.hourlyK;

  return (
    <>
      <div className="sec-head">
        <div className="sec-title">Klient-menejer — Aloqa tahlili</div>
      </div>

      <TabBar tabs={CALL_TABS} active={callTab} onChange={setCallTab} />

      <div className="kpi-grid-7">
        <KPICard label="Jami"               value={data.jami}              sub="qongiroqlar" />
        <KPICard label="Kiruvchi"            value={data.kiruvchi}          sub="qongiroq" />
        <KPICard label="Chiquvchi"           value={data.chiquvchi}         sub="qongiroq" />
        <KPICard label="Otkazib yuborilgan"  value={data.otkazib}           sub="qongiroq"  variant="red" />
        <KPICard label="Qayta chiqilgan"     value={data.qaytaChiqilgan}    sub="qongiroq"  variant="gold" />
        <KPICard label="Qayta chiqilmagan"   value={data.qaytaChiqilmagan}  sub="qongiroq" />
        <KPICard label="Otkazib yuborish %"  value={data.otkazibPct}        sub="otkazish darajasi" variant="red" />
      </div>

      <div className="two-panel">
        <div className="panel-card">
          <div className="chart-title" style={{ marginBottom: 14 }}>Otkazib yuborilgan natijalari</div>
          <div className="missed-stats">
            <div className="mstat">
              <span className="mstat-val">{data.missedStats.qaytaChiqilgan}</span>
              <span className="mstat-lbl">Qayta chiqilgan</span>
            </div>
            <div className="mstat">
              <span className="mstat-val">{data.missedStats.qaytaChiqilmagan}</span>
              <span className="mstat-lbl">Qayta chiqilmagan</span>
            </div>
            <div className="mstat">
              <span className="mstat-val">{data.missedStats.qaytaAloqaDaq}</span>
              <span className="mstat-lbl">Qayta aloqa (daq)</span>
            </div>
          </div>
          {(data.bars || []).map((bar) => (
            <HBar key={bar.lbl + callTab} lbl={bar.lbl} pct={bar.pct} cls={bar.cls} />
          ))}
        </div>

        <div className="panel-card">
          <div className="chart-title" style={{ marginBottom: 3 }}>Qongiroqlar soat boyicha</div>
          <div className="chart-sub">Kunlik taqsimot</div>
          <HourlyBarChart key={callTab} data={hourly || []} />
        </div>
      </div>

      {/* ── TELEGRAM BLOCK ── */}
      {telegram?.kpi && (
        <>
          <div className="sec-divider" />
          <div>
            <div className="tg-block-head">
              <div>
                <div className="tg-sub-title">Telegram — Xabarlar tahlili</div>
                <div className="tg-sub-desc">Mijoz xabarlari va menejer javoblari</div>
              </div>
              <TabBar tabs={TG_TABS} active={tgTab} onChange={setTgTab} style={{ marginBottom: 0 }} />
            </div>

            <div className="kpi-grid-6">
              <KPICard label="Jami xabarlar"       value={telegram.kpi.jamiXabarlar}      sub="bugun" />
              <KPICard label="Mijoz xabarlari"      value={telegram.kpi.mijozXabarlari}    sub="xabar" />
              <KPICard label="Menejer javoblari"    value={telegram.kpi.menejerJavoblari}  sub="javob" variant="gold" />
              <KPICard label="Ortacha javob vaqti"  value={telegram.kpi.ortachaJavobVaqti} sub="daqiqa" />
              <KPICard label="Javob darajasi"       value={telegram.kpi.javobDarajasi}     sub="javob berilgan" />
              <KPICard label="Murojaat hal qilish"  value={telegram.kpi.murojaatHal}       sub="hal qilingan" />
            </div>

            <div className="chart-card">
              <div className="chart-title">Kategoriya boyicha</div>
              <div className="chart-sub">Xabar va murojaatlar tahlili</div>
              <CategoryChart key={tgTab} data={telegram.cats || []} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function HBar({ lbl, pct, cls }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) setTimeout(() => { ref.current.style.width = pct + '%'; }, 80);
  }, [pct]);

  return (
    <div className="hbar-row">
      <div className="hbar-lbl"><span>{lbl}</span><span>{pct}%</span></div>
      <div className="hbar-track">
        <div ref={ref} className={`hbar-fill ${cls}`} style={{ width: 0 }} />
      </div>
    </div>
  );
}
