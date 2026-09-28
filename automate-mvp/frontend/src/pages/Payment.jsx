import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Lock, CreditCard } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../api.js';
import { getState } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];

function loadPaystackScript() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Paystack checkout script could not be loaded.'));
    document.body.appendChild(script);
  });
}

export default function Payment() {
  const state = getState();
  const navigate = useNavigate();
  const toast = useToast();
  const [query] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  if (!state.student || !state.student.regNo) {
    navigate('/capture');
    return null;
  }

  const s = state.student;
  const totalAmount = Number(s.amount || 0);
  const registrationFee = Math.round(totalAmount / 1.037);
  const serviceFee = totalAmount - registrationFee;
  const amountLabel = `NGN ${totalAmount.toLocaleString('en-NG')}`;

  useEffect(() => {
    const reference = query.get('reference') || query.get('trxref');
    const status = query.get('status');
    if (!reference || status !== 'success') return;

    (async () => {
      setProcessing(true);
      try {
        const res = await api.verifyPayment(s.regNo, reference);
        if (res.verified) {
          setDone(true);
          setTimeout(() => navigate(`/capture/success?reg=${encodeURIComponent(s.regNo)}`), 500);
        } else {
          toast.push({ kind: 'error', title: 'Payment not verified', message: 'Your transaction was not completed successfully.' });
        }
      } catch (err) {
        toast.push({ kind: 'error', title: 'Payment verification failed', message: err.message });
      } finally {
        setProcessing(false);
      }
    })();
  }, [query, navigate, s.regNo, toast]);

  async function verify(reference) {
    setProcessing(true);
    try {
      const res = await api.verifyPayment(s.regNo, reference);
      if (res.verified) {
        setDone(true);
        setTimeout(() => navigate(`/capture/success?reg=${encodeURIComponent(s.regNo)}`), 500);
      } else {
        toast.push({ kind: 'error', title: 'Payment not verified', message: 'Your transaction was not completed successfully.' });
      }
    } catch (err) {
      toast.push({ kind: 'error', title: 'Payment verification failed', message: err.message });
    } finally {
      setProcessing(false);
    }
  }

  async function pay() {
    setProcessing(true);
    try {
      await loadPaystackScript();
      const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!publicKey || publicKey.includes('your_public_key') || publicKey.includes('replace_with')) {
        throw new Error('VITE_PAYSTACK_PUBLIC_KEY is not configured. Add your Paystack test public key in frontend/.env.');
      }

      const init = await api.initializePayment(s.regNo, s.email, totalAmount);
      if (init.alreadyPaid) {
        navigate(`/capture/success?reg=${encodeURIComponent(s.regNo)}`);
        return;
      }

      const handler = window.PaystackPop.setup({
        key: publicKey,
        email: s.email,
        amount: Math.round(init.amount * 100),
        ref: init.reference,
        currency: 'NGN',
        metadata: {
          custom_fields: [{ display_name: 'Student Registration', variable_name: 'student_reg_no', value: s.regNo }],
        },
        callback: (response) => {
          verify(response.reference);
        },
        onClose: () => {
          setOpen(false);
          toast.push({ kind: 'info', title: 'Payment cancelled', message: 'Payment was not completed. You can try again any time.' });
        },
      });

      setOpen(false);
      handler.openIframe();
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
          <p>Confirm the details below, then proceed to the Paystack checkout.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/capture/form')}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <StepIndicator steps={STEPS} activeIndex={4} />

      <div className="glass">
        <div className="paystack-brand">
          <div className="badge">PAYSTACK</div>
          <div className="sim">TEST MODE</div>
        </div>
        <h3>Order summary</h3>
        <div className="summary-list mt-12">
          <div className="row"><span className="label">Full name</span><span className="value">{s.fullName}</span></div>
          <div className="row"><span className="label">Email</span><span className="value">{s.email}</span></div>
          <div className="row"><span className="label">Phone</span><span className="value">{s.phone}</span></div>
          <div className="row"><span className="label">Category</span><span className="value">{s.category === 'IT' ? 'IT Student' : 'General Student'}</span></div>
          <div className="row"><span className="label">Department</span><span className="value">{s.departmentName}</span></div>
          <div className="row"><span className="label">Reference</span><span className="value">{s.regNo}</span></div>
          <div className="row"><span className="label">Registration fee</span><span className="value">NGN {registrationFee.toLocaleString('en-NG')}</span></div>
          <div className="row"><span className="label">Service fee (3.7%)</span><span className="value">NGN {serviceFee.toLocaleString('en-NG')}</span></div>
          <div className="row"><span className="label">Total amount</span><span className="value" style={{ color: '#4f8cff' }}>{amountLabel}</span></div>
        </div>

        <div className="mt-24 flex-between">
          <div className="text-dim" style={{ fontSize: 13 }}>
            <Lock size={12} style={{ verticalAlign: 'middle' }} /> No real bank details are entered in AUTOMATE. You will use Paystack Test Mode to complete the payment.
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
        subtitle="Use the Paystack test checkout to complete your registration."
      >
        <div className="paystack-brand">
          <div className="badge">PAYSTACK</div>
          <div className="sim">TEST MODE</div>
        </div>

        <div className="summary-list mt-12">
          <div className="row"><span className="label">Reference</span><span className="value">{s.regNo}</span></div>
          <div className="row"><span className="label">Department</span><span className="value">{s.departmentName}</span></div>
          <div className="row"><span className="label">Registration fee</span><span className="value">NGN {registrationFee.toLocaleString('en-NG')}</span></div>
          <div className="row"><span className="label">Service fee</span><span className="value">NGN {serviceFee.toLocaleString('en-NG')}</span></div>
          <div className="row"><span className="label">Total</span><span className="value" style={{ color: '#4f8cff' }}>{amountLabel}</span></div>
        </div>

        <div className="text-dim mt-16" style={{ fontSize: 13, lineHeight: 1.6 }}>
          AUTOMATE initializes the transaction securely on the backend and verifies the payment with Paystack before the registration is marked as paid.
        </div>

        <div className="flex-between mt-24">
          <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={processing}>Cancel</button>
          <button className="btn btn-primary" onClick={pay} disabled={processing || done}>
            {done ? (
              <><CheckCircle2 size={14} /> Payment verified</>
            ) : processing ? (
              <><div className="spinner" /> Processing with Paystack…</>
            ) : (
              'Pay with Paystack'
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
