import { useEffect, useRef } from 'react';
import { fmt } from '../../utils/formatters.js';

export default function DeptCard({ dept }) {
  const { name, st, jami, baj, qol, pct } = dept;
  const isK = st === 'Kritik';
  const fillRef = useRef(null);

  useEffect(() => {
    if (fillRef.current) {
      setTimeout(() => { if (fillRef.current) fillRef.current.style.width = pct + '%'; }, 80);
    }
  }, [pct]);

  return (
    <div className="dept-card">
      <div className="dept-head">
        <div className="dept-name">{name}</div>
        <div className={`badge ${isK ? 'kritik' : 'normal'}`}>{st}</div>
      </div>
      <div className="dept-stats">
        <div className="dept-stat">
          <span className="dstat-val">{fmt(jami)}</span>
          <span className="dstat-lbl">Jami zakaz</span>
        </div>
        <div className="dept-stat">
          <span className="dstat-val">{fmt(baj)}</span>
          <span className="dstat-lbl">Bajarildi</span>
        </div>
        <div className="dept-stat">
          <span className="dstat-val">{fmt(qol)}</span>
          <span className="dstat-lbl">Qoldi</span>
        </div>
      </div>
      <div className="prog-row">
        <div className="prog-track">
          <div className={`prog-fill ${isK ? 'k' : 'n'}`} ref={fillRef} />
        </div>
        <div className="prog-pct">{pct}%</div>
      </div>
    </div>
  );
}
