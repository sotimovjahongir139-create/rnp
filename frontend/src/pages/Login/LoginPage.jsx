import { useState } from 'react';
import { login } from '../../services/api.js';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username, password);
      localStorage.setItem('token', data.token);
      onLogin();
    } catch {
      setError('Noto\'g\'ri login yoki parol');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f0ede8', fontFamily: 'inherit',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px', width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: '#1a3a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 19 19" fill="none" width="20" height="20">
              <rect x="2" y="11" width="4" height="6" rx="1.5" fill="white" opacity="0.6"/>
              <rect x="7.5" y="7" width="4" height="10" rx="1.5" fill="white" opacity="0.8"/>
              <rect x="13" y="4" width="4" height="13" rx="1.5" fill="white"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a3a2a' }}>Analitika</div>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Dashboard</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6, fontWeight: 600 }}>
              Login
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd',
                fontSize: 14, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = '#287D4F'}
              onBlur={e => e.target.style.borderColor = '#ddd'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6, fontWeight: 600 }}>
              Parol
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd',
                fontSize: 14, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = '#287D4F'}
              onBlur={e => e.target.style.borderColor = '#ddd'}
            />
          </div>
          {error && (
            <div style={{ color: '#c0392b', fontSize: 13, marginBottom: 14, background: '#fdf0ef', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, border: 'none',
              background: loading ? '#aaa' : '#287D4F', color: '#fff', fontWeight: 700,
              fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Kirish...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}
