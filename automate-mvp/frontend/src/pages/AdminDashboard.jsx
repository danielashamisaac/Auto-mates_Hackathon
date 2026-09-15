import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, LogOut, RefreshCw, Search, Save } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { rowsToCsv, downloadCsv } from '../utils/csv.js';

function fmt(n) {
  return 'NGN ' + Number(n || 0).toLocaleString('en-NG');
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState({});
  const toast = useToast();
  const navigate = useNavigate();

  async function load() {
    setBusy(true);
    try {
      const [s, st] = await Promise.all([api.adminSummary(), api.adminStudents()]);
      setSummary(s);
      setStudents(st);
    } catch (err) {
      if (err.status === 401) {
        toast.push({ kind: 'error', title: 'Session expired', message: 'Please sign in again.' });
        navigate('/admin');
        return;
      }
      toast.push({ kind: 'error', title: 'Failed to load', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    await api.adminLogout().catch(() => {});
    navigate('/admin');
  }

  function exportCsv() {
    const headers = [
      'reg_no', 'full_name', 'email', 'phone', 'category',
      'department_slug', 'department_name', 'amount', 'paid',
      'created_at', 'paid_at',
    ];
    const rows = filteredStudents.map((s) => ({
      ...s,
      paid: s.paid ? 'PAID' : 'PENDING',
    }));
    const csv = rowsToCsv(headers, rows);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`automate-students-${today}.csv`, csv);
    toast.push({ kind: 'success', title: 'Export ready', message: `${rows.length} rows written to CSV.` });
  }

  async function saveCapacity(slug) {
    const value = Number(editing[slug]);
    if (!Number.isFinite(value) || value < 0) {
      toast.push({ kind: 'error', title: 'Invalid capacity', message: 'Enter a non-negative number.' });
      return;
    }
    try {
      await api.adminUpdateCapacity(slug, value);
      setEditing((prev) => ({ ...prev, [slug]: '' }));
      await load();
      toast.push({ kind: 'success', title: 'Capacity updated', message: `${slug} → ${value}` });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Update failed', message: err.message });
    }
  }

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchesCat = category === 'ALL' || s.category === category;
      const matchesSearch =
        !term ||
        s.full_name.toLowerCase().includes(term) ||
        s.email.toLowerCase().includes(term) ||
        s.reg_no.toLowerCase().includes(term) ||
        s.department_name.toLowerCase().includes(term);
      return matchesCat && matchesSearch;
    });
  }, [students, search, category]);

  if (!summary) {
    return (
      <div className="page flex-center">
        <div className="spinner spinner-big" />
      </div>
    );
  }

  const t = summary.totals;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Live metrics, registrations, and department capacity.</p>
        </div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" onClick={load} disabled={busy}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-ghost" onClick={logout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="label">Total Registered</div>
          <div className="value">{t.totalRegistered}</div>
        </div>
        <div className="metric">
          <div className="label">Total Revenue</div>
          <div className="value">{fmt(t.totalRevenue)}</div>
        </div>
        <div className="metric">
          <div className="label">IT Students</div>
          <div className="value">{t.totalIt}</div>
        </div>
        <div className="metric">
          <div className="label">General Students</div>
          <div className="value">{t.totalGeneral}</div>
        </div>
      </div>

      <div className="section">
        <h2>Department breakdown</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Department</th>
                <th>Capacity</th>
                <th>Registered</th>
                <th>Paid</th>
                <th>Revenue</th>
                <th>Edit capacity</th>
              </tr>
            </thead>
            <tbody>
              {summary.perDepartment.map((d) => (
                <tr key={d.slug}>
                  <td>{d.name}</td>
                  <td>{d.capacity}</td>
                  <td>{d.totalRegistered}</td>
                  <td>{d.paid}</td>
                  <td>{fmt(d.revenue)}</td>
                  <td>
                    <div className="flex gap-8">
                      <input
                        type="number"
                        min="0"
                        placeholder={String(d.capacity)}
                        value={editing[d.slug] ?? ''}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [d.slug]: e.target.value }))}
                        style={{ width: 100 }}
                      />
                      <button className="btn btn-ghost" onClick={() => saveCapacity(d.slug)}>
                        <Save size={14} /> Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2>Registrations</h2>
        <div className="search-bar">
          <input
            placeholder="Search by name, email, reference, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="ALL">All categories</option>
            <option value="IT">IT Student</option>
            <option value="GENERAL">General Student</option>
          </select>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 && (
                <tr><td colSpan="7" className="text-center text-dim" style={{ padding: 24 }}>No matching registrations yet.</td></tr>
              )}
              {filteredStudents.map((s) => (
                <tr key={s.reg_no}>
                  <td>{s.full_name}<div className="text-dim" style={{ fontSize: 11 }}>{s.reg_no}</div></td>
                  <td>{s.email}<div className="text-dim" style={{ fontSize: 11 }}>{s.phone}</div></td>
                  <td>{s.department_name}</td>
                  <td>{s.category === 'IT' ? 'IT' : 'General'}</td>
                  <td>{fmt(s.amount)}</td>
                  <td>
                    <span className={`status-pill ${s.paid ? 'paid' : 'pending'}`}>
                      {s.paid ? 'PAID' : 'PENDING'}
                    </span>
                  </td>
                  <td>{s.created_at}{s.paid_at && <div className="text-dim" style={{ fontSize: 11 }}>Paid {s.paid_at}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="export-row">
          <button className="btn btn-primary" onClick={exportCsv}>
            <Download size={16} /> Export Records as CSV
          </button>
        </div>
      </div>
    </div>
  );
}
