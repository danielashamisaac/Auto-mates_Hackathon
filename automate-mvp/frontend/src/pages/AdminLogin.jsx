import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, LogIn } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

export default function AdminLogin() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.adminLogin(username, password);
      toast.push({ kind: 'success', title: 'Welcome back', message: 'Signed in as admin.' });
      navigate('/admin/dashboard');
    } catch (err) {
      toast.push({ kind: 'error', title: 'Login failed', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 460 }}>
      <div className="page-header">
        <div>
          <h1>Admin Portal</h1>
          <p>Sign in to view live analytics and manage registrations.</p>
        </div>
      </div>

      <form className="glass" onSubmit={submit}>
        <div>
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </div>
        <div className="mt-16">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button className="btn btn-primary btn-block mt-24" type="submit" disabled={busy}>
          {busy ? <div className="spinner" /> : <><LogIn size={14} /> Sign in</>}
        </button>
        <div className="text-center text-dim mt-16" style={{ fontSize: 12 }}>
          <Lock size={12} /> Demo credentials: <code>admin</code> / <code>admin123</code>
        </div>
      </form>
    </div>
  );
}
