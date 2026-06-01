import { useDashboard } from '../../context/DashboardContext.jsx';

const NAV_ITEMS = [
  { id: 'ishlab-chiqarish', label: 'Ishlab chiqarish', dot: 'g'  },
  { id: 'klient-menejer',   label: 'Klient-menejer',   dot: 'g'  },
  { id: 'sifat-nazorati',   label: 'Sifat nazorati',   dot: 'gr' },
  { id: 'sotuv',            label: 'Sotuv',             dot: 'gr' },
  { id: 'marketing',        label: 'Marketing',         dot: 'gr' },
  { id: 'scriptlar',        label: 'Scriptlar',         dot: 'g'  },
];

export default function Sidebar() {
  const { activeSection, setActiveSection } = useDashboard();

  return (
    <aside className="sidebar">
      <div className="sb-logo">
        <div className="logo-wrap">
          <div className="logo-icon">
            <svg viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2"   y="11" width="4" height="6"  rx="1.5" fill="white" opacity="0.6"/>
              <rect x="7.5" y="7"  width="4" height="10" rx="1.5" fill="white" opacity="0.8"/>
              <rect x="13"  y="4"  width="4" height="13" rx="1.5" fill="white"/>
              <path d="M3.5 9.5L8 6l3.5 3L15.5 4" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="logo-name">Analitika</div>
            <div className="logo-sub">Dashboard</div>
          </div>
        </div>
      </div>

      <nav className="sb-nav">
        <div className="sb-sec-label">Bolimlar</div>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`nav-item${activeSection === item.id ? ' active' : ''}`}
            onClick={() => setActiveSection(item.id)}
          >
            <span className={`nav-dot ${item.dot}`}></span>
            <span className="nav-label">{item.label}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
