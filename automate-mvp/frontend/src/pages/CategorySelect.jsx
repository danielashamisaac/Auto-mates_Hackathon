import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, GraduationCap, Briefcase } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import { api } from '../api.js';
import { getState, patchState, clearState } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];

export default function CategorySelect() {
  const [departments, setDepartments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getDepartments();
        if (!cancelled) setDepartments(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load departments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startFresh() {
    clearState();
    setSelected(null);
  }

  function next() {
    if (!selected) {
      toast.push({ kind: 'error', title: 'Pick a category', message: 'Please choose IT or General to continue.' });
      return;
    }
    patchState({ category: selected, step: 1 });
    navigate('/capture/department');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Step 1 · Choose your category</h1>
          <p>This determines the documents we ask for and the fees you'll see.</p>
        </div>
        <button className="btn btn-ghost" onClick={startFresh}>Reset session</button>
      </div>

      <StepIndicator steps={STEPS} activeIndex={0} />

      {error && (
        <div className="warning-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="category-picker">
        <div
          className={`category-card ${selected === 'IT' ? 'selected' : ''}`}
          onClick={() => setSelected('IT')}
          role="button"
          tabIndex={0}
        >
          <div className="flex" style={{ alignItems: 'center', gap: 12 }}>
            <GraduationCap size={22} color="#4f8cff" />
            <h3>IT Student</h3>
          </div>
          <p className="text-dim mt-12" style={{ fontSize: 14, lineHeight: 1.55 }}>
            You are studying an IT-related program. We will collect your institution, matric number,
            and IT duration. Fee is a flat <strong style={{ color: '#e8ecff' }}>NGN 22,000</strong> across
            all departments.
          </p>
          <div className="cat-price">NGN 22,000 flat</div>
        </div>

        <div
          className={`category-card ${selected === 'GENERAL' ? 'selected' : ''}`}
          onClick={() => setSelected('GENERAL')}
          role="button"
          tabIndex={0}
        >
          <div className="flex" style={{ alignItems: 'center', gap: 12 }}>
            <Briefcase size={22} color="#a05cff" />
            <h3>General Student</h3>
          </div>
          <p className="text-dim mt-12" style={{ fontSize: 14, lineHeight: 1.55 }}>
            Not currently enrolled in IT? Choose this and we'll collect basic bio-data. Department
            fees vary by program.
          </p>
          <div className="cat-price">Department-based pricing</div>
        </div>
      </div>

      <div className="mt-24 text-dim" style={{ fontSize: 13 }}>
        {loading ? 'Loading departments…' : `${departments.length} departments available`}
      </div>

      <div className="mt-24 flex" style={{ justifyContent: 'flex-end', gap: 12 }}>
        <button className="btn btn-primary" onClick={next} disabled={!selected}>Continue →</button>
      </div>
    </div>
  );
}
