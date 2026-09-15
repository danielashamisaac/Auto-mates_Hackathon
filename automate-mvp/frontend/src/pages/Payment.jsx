import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Lock, CreditCard } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../api.js';
import { getState } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];

export default function Payment() {
  const state = getState();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  if (!state.student || !state.student.regNo) {
    navigate('/capture');
    return null;
  }

  const s = state.student;
  const amountLabel = `NGN ${s.amount.toLocaleString('en-NG')}`;

  async function pay() {
    setProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const res = await api.verifyPayment(s.regNo);
      if (res.verified) {
        setDone(true);
        setTimeout(() => navigate(`/capture/success?reg=${encodeURIComponent(s.regNo)}`), 900);
      }
    } catch (err) {
      toast.push({ kind: 'error', title: 'Payment failed', message: err.message });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Step 5 · Payment</h1>
          <p>Confirm the details below, then proceed to the (simulated) Paystack checkout.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/capture/form')}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <StepIndicator steps={STEPS} activeIndex={4} />

      <div className="glass">
        <div className="paystack-brand">
          <div className="badge">PAYSTACK</div>
          <div className="sim">SIMULATED · DEMO ONLY</div>
        </div>
        <h3>Order summary</h3>
        <div className="summary-list mt-12">
          <div className="row"><span className="label">Full name</span><span className="value">{s.fullName}</span></div>
          <div className="row"><span className="label">Email</span><span className="value">{s.email}</span></div>
          <div className="row"><span className="label">Phone</span><span className="value">{s.phone}</span></div>
          <div className="row"><span className="label">Category</span><span className="value">{s.category === 'IT' ? 'IT Student' : 'General Student'}</span></div>
          <div className="row"><span className="label">Department</span><span className="value">{s.departmentName}</span></div>
          <div className="row"><span className="label">Reference</span><span className="value">{s.regNo}</span></div>
          <div className="row"><span className="label">Amount</span><span className="value" style={{ color: '#4f8cff' }}>{amountLabel}</span></div>
        </div>

        <div className="mt-24 flex-between">
          <div className="text-dim" style={{ fontSize: 13 }}>
            <Lock size={12} style={{ verticalAlign: 'middle' }} /> No real card data is collected — this is a visual prototype.
          </div>
          <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={processing}>
            <CreditCard size={14} /> Pay {amountLabel}
          </button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => !processing && setOpen(false)}
        title="Paystack Checkout"
        subtitle="A simulated Paystack checkout — no real card or PIN is requested."
      >
        <div className="paystack-brand">
          <div className="badge">PAYSTACK</div>
          <div className="sim">TEST MODE</div>
        </div>

        <div className="summary-list mt-12">
          <div className="row"><span className="label">Reference</span><span className="value">{s.regNo}</span></div>
          <div className="row"><span className="label">Description</span><span className="value">{s.departmentName} · {s.category}</span></div>
          <div className="row"><span className="label">Amount</span><span className="value" style={{ color: '#4f8cff' }}>{amountLabel}</span></div>
        </div>

        <div className="text-dim mt-16" style={{ fontSize: 13, lineHeight: 1.6 }}>
          In production this modal collects card details and authorizes with Paystack. For this demo,
          click the button below to record a successful payment in the AUTOMATE database.
        </div>

        <div className="flex-between mt-24">
          <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={processing}>Cancel</button>
          <button className="btn btn-primary" onClick={pay} disabled={processing || done}>
            {done ? (
              <><CheckCircle2 size={14} /> Payment verified</>
            ) : processing ? (
              <><div className="spinner" /> Processing with Paystack…</>
            ) : (
              'Simulate Successful Payment'
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
