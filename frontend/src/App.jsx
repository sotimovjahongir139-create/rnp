import { useState } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import ProductionPage from './pages/Production/ProductionPage.jsx';
import CRMPage from './pages/CRM/CRMPage.jsx';
import ScriptsPage from './pages/Scripts/ScriptsPage.jsx';
import QCPage from './pages/QC/QCPage.jsx';
import PlaceholderPage from './pages/Placeholder/PlaceholderPage.jsx';
import LoginPage from './pages/Login/LoginPage.jsx';
import './styles/globals.css';

const PLACEHOLDER_ICONS = {
  'sifat-nazorati': (
    <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
      <circle cx="22" cy="22" r="12" stroke="#287D4F" strokeWidth="3"/>
      <path d="M31 31l10 10" stroke="#287D4F" strokeWidth="3" strokeLinecap="round"/>
      <path d="M18 22h8M22 18v8" stroke="#34C377" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  sotuv: (
    <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
      <rect x="7"  y="30" width="8" height="13" rx="2" fill="#34C377" opacity="0.65"/>
      <rect x="21" y="22" width="8" height="21" rx="2" fill="#34C377" opacity="0.85"/>
      <rect x="35" y="15" width="8" height="28" rx="2" fill="#287D4F"/>
      <path d="M9.5 28l12-9 8 5 11-13" stroke="#B5741A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="40.5" cy="11" r="3.5" fill="#B5741A"/>
    </svg>
  ),
  marketing: (
    <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
      <path d="M10 20v10l7 2 20 10V8L17 20H10z" fill="#34C377" opacity="0.75"/>
      <path d="M17 20v10" stroke="#287D4F" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M37 17c4 2 6 5 6 9s-2 7-6 9" stroke="#B5741A" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
};

function Pages() {
  const { activeSection } = useDashboard();

  return (
    <main className="main">
      <div className={`section${activeSection === 'ishlab-chiqarish' ? ' active' : ''}`}>
        <ProductionPage />
      </div>
      <div className={`section${activeSection === 'klient-menejer' ? ' active' : ''}`}>
        <CRMPage />
      </div>
      <div className={`section${activeSection === 'scriptlar' ? ' active' : ''}`}>
        <ScriptsPage />
      </div>
      <div className={`section${activeSection === 'sifat-nazorati' ? ' active' : ''}`}>
        <QCPage />
      </div>
      {['sotuv', 'marketing'].map((id) => (
        <div key={id} className={`section${activeSection === id ? ' active' : ''}`}>
          <PlaceholderPage
            title={id === 'sotuv' ? 'Sotuv' : 'Marketing'}
            icon={PLACEHOLDER_ICONS[id]}
          />
        </div>
      ))}
    </main>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'));

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <DashboardProvider>
      <div className="app">
        <Sidebar />
        <Pages />
      </div>
    </DashboardProvider>
  );
}
