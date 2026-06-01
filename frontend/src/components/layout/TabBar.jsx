export default function TabBar({ tabs, active, onChange, style }) {
  return (
    <div className="tabs-bar" style={style}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn${active === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
