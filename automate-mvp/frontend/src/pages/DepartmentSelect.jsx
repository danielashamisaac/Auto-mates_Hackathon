import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Users, ArrowLeft } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import { api } from '../api.js';
import { getState } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];

export default function DepartmentSelect() {
  const [departments, setDepartments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const state = getState();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!state.category) {
      navigate('/capture');
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getDepartments();
        if (!cancelled) setDepartments(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load departments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate, state.category]);

  function pick(d) {
    if (d.isFull) {
      toast.push({ kind: 'error', title: 'Department full', message: `${d.name} has no slots left — pick another program.` });
      return;
    }
    sessionStorage.setItem('automate-hub-state', JSON.stringify({ ...state, department: d, step: 2 }));
    navigate('/capture/eligibility');
  }

  const allFull = useMemo(() => departments.length > 0 && departments.every((d) => d.isFull), [departments]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Step 2 · Pick a department</h1>
          <p>Each program has a limited number of seats. Live capacity is shown below.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/capture')}>
          <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back
        </button>
      </div>

      <StepIndicator steps={STEPS} activeIndex={1} />

      {error && (
        <div className="warning-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {allFull && (
        <div className="warning-banner" style={{ background: 'rgba(255,85,119,0.12)', borderColor: 'rgba(255,85,119,0.4)', color: '#ff5577' }}>
          <AlertTriangle size={18} />
          All departments are currently full. Please check back later.
        </div>
      )}

      <div className="dept-grid">
        {departments.map((d) => (
          <div
            key={d.slug}
            className={`dept-card ${d.isFull ? 'full' : ''}`}
            onClick={() => pick(d)}
            role="button"
            tabIndex={0}
          >
            <div className="dept-head">
              <div>
                <h3>{d.name}</h3>
                <div className="dept-meta">
                  Capacity {d.capacity} · {state.category === 'IT' ? `NGN 22,000 (IT flat)` : `NGN ${d.generalPrice.toLocaleString('en-NG')}`}
                </div>
              </div>
              <div className={`slots-pill ${d.isFull ? 'full' : ''}`}>
                <Users size={12} />
                {d.isFull ? 'Full' : `${d.slotsRemaining} left`}
              </div>
            </div>
            {d.isFull && (
              <div className="mt-12" style={{ color: '#ff5577', fontSize: 13, fontWeight: 600 }}>
                Department Full — Please select another program
              </div>
            )}
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex-center mt-24 text-dim">
          <div className="spinner" /> Loading departments…
        </div>
      )}
    </div>
  );
}
