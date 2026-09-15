import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { api } from '../api.js';
import { patchState } from '../store.js';
import { useToast } from '../components/Toast.jsx';

export default function ResumePayment() {
  const [regNo, setRegNo] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function lookup(e) {
    e.preventDefault();
    if (!regNo.trim()) return;
    setBusy(true);
    try {
      const s = await api.getStudent(regNo.trim().toUpperCase());
      if (s.paid) {
        toast.push({ kind: 'info', title: 'Already paid', message: 'Your registration is already complete.' });
        navigate(`/capture/success?reg=${encodeURIComponent(s.regNo)}`);
        return;
      }
      patchState({
        candidateId: s.candidateId || 'resume_' + Math.random().toString(36).slice(2),
        student: {
          regNo: s.regNo,
          amount: s.amount,
          departmentName: s.departmentName,
          category: s.category,
          fullName: s.fullName,
          email: s.email,
          phone: s.phone,
          departmentSlug: s.departmentSlug,
        },
      });
      navigate('/capture/payment');
    } catch (err) {
      toast.push({ kind: 'error', title: 'Not found', message: 'No registration matches that reference.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Payment Portal</h1>
          <p>Already registered? Look yourself up by your reference and complete payment.</p>
        </div>
      </div>

      <form className="glass" onSubmit={lookup}>
        <label>Registration Reference</label>
        <input
          value={regNo}
          onChange={(e) => setRegNo(e.target.value.toUpperCase())}
          placeholder="AUT-2026-XXXX"
          autoFocus
        />
        <div className="flex-between mt-24">
          <span className="text-dim" style={{ fontSize: 13 }}>Format: AUT-YYYY-XXXX (e.g. AUT-2026-AB12)</span>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <div className="spinner" /> : <><Search size={14} /> Look up & continue <ArrowRight size={14} /></>}
          </button>
        </div>
      </form>
    </div>
  );
}
