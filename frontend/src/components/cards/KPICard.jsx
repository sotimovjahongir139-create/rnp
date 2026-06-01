import { useEffect, useRef } from 'react';
import { rafAnim } from '../../utils/svgHelpers.js';
import { fmt } from '../../utils/formatters.js';

export default function KPICard({ label, value, sub, variant, animate = true, note }) {
  const valRef = useRef(null);
  const isNumeric = typeof value === 'number';

  useEffect(() => {
    if (!animate || !isNumeric || !valRef.current) return;
    rafAnim(0, value, 1100, 0, (v) => {
      if (valRef.current) valRef.current.textContent = fmt(v);
    });
  }, [value, animate]);

  return (
    <div className={`kpi-card${variant ? ` ${variant}` : ''}`}>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val" ref={isNumeric ? valRef : null}>
        {isNumeric ? '0' : value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {note && <span className="kpi-pending-note">{note}</span>}
    </div>
  );
}
