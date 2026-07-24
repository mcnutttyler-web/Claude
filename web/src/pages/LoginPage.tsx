import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, type SessionUser } from '../api.js';

export default function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('dispatch.north@metroexpress.dev');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      onLogin(user);
      navigate(user.organizationType === 'SHIPPER' ? '/shipper' : '/operator');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>RoutePilot</h1>
        <div className="subtitle">Reliability control for recurring delivery routes</div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div className="demo-accounts">
          Seeded demo logins (password: password123):
          <br />
          admin@metroexpress.dev · dispatch.north@metroexpress.dev
          <br />
          admin@cascademedical.dev (shipper)
        </div>
      </div>
    </div>
  );
}
