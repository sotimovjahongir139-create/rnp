export default function PlaceholderPage({ title, icon }) {
  return (
    <>
      <div className="sec-head">
        <div className="sec-title">{title}</div>
      </div>
      <div className="ph-wrap">
        <div className="ph-icon">{icon}</div>
        <div className="ph-title">{title}</div>
        <div className="ph-desc">Malumotlar yigilmoqda</div>
        <div className="ph-btn">Tez kunda</div>
      </div>
    </>
  );
}
