import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import { api } from '../api.js';
import { getState, patchState } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];

const IT_DURATIONS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', 'HND 1', 'HND 2', 'Other'];

export default function CaptureForm() {
  const state = getState();
  const navigate = useNavigate();
  const toast = useToast();

  const isIT = state.category === 'IT';

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    gender: 'Male',
    dob: '',
    address: '',
    institution: '',
    matricNo: '',
    itDuration: IT_DURATIONS[0],
  });
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.fullName || !form.email || !form.phone) {
      toast.push({ kind: 'error', title: 'Missing details', message: 'Name, email, and phone are required.' });
      return;
    }
    if (isIT && (!form.institution || !form.matricNo)) {
      toast.push({ kind: 'error', title: 'Missing IT details', message: 'Institution and matric number are required for IT students.' });
      return;
    }

    const extra = isIT
      ? {
          institution: form.institution,
          matricNo: form.matricNo,
          itDuration: form.itDuration,
        }
      : {
          gender: form.gender,
          dob: form.dob,
          address: form.address,
        };

    setSubmitting(true);
    try {
      const res = await api.createStudent({
        candidateId: state.candidateId,
        departmentSlug: state.department.slug,
        category: state.category,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        extra,
      });

      patchState({
        student: {
          regNo: res.regNo,
          amount: res.amount,
          departmentName: res.departmentName,
          category: res.category,
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          departmentSlug: state.department.slug,
        },
        step: 4,
      });

      navigate('/capture/payment');
    } catch (err) {
      toast.push({ kind: 'error', title: 'Could not register', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (!state.department) {
    navigate('/capture');
    return null;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Step 4 · Your details</h1>
          <p>{isIT ? 'IT Student' : 'General Student'} · {state.department.name}</p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/capture/eligibility')}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <StepIndicator steps={STEPS} activeIndex={3} />

      <form className="glass" onSubmit={submit}>
        <div className="form-grid">
          <div>
            <label>Full Name</label>
            <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
          </div>
          <div>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          </div>
          <div>
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} required />
          </div>
          {!isIT && (
            <>
              <div>
                <label>Gender</label>
                <select value={form.gender} onChange={(e) => update('gender', e.target.value)}>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label>Date of Birth</label>
                <input type="date" value={form.dob} onChange={(e) => update('dob', e.target.value)} />
              </div>
              <div className="full">
                <label>Home Address</label>
                <input value={form.address} onChange={(e) => update('address', e.target.value)} />
              </div>
            </>
          )}
          {isIT && (
            <>
              <div>
                <label>Institution Name</label>
                <input value={form.institution} onChange={(e) => update('institution', e.target.value)} required />
              </div>
              <div>
                <label>Matric Number</label>
                <input value={form.matricNo} onChange={(e) => update('matricNo', e.target.value)} required />
              </div>
              <div className="full">
                <label>IT Duration / Level</label>
                <select value={form.itDuration} onChange={(e) => update('itDuration', e.target.value)}>
                  {IT_DURATIONS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="flex-between mt-24">
          <div className="text-dim" style={{ fontSize: 13 }}>
            By submitting you confirm the details above are correct. Fee:{' '}
            <strong style={{ color: '#e8ecff' }}>
              NGN {state.category === 'IT' ? '22,000' : state.department.generalPrice.toLocaleString('en-NG')}
            </strong>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? <div className="spinner" /> : 'Save & continue →'}
          </button>
        </div>
      </form>
    </div>
  );
}
