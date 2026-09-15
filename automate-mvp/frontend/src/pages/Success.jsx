import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Award, FileText, Calendar, Home } from 'lucide-react';
import { api } from '../api.js';
import { downloadReceipt, downloadTimetable } from '../utils/pdf.js';

export default function Success() {
  const [params] = useSearchParams();
  const regNo = params.get('reg');
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!regNo) {
      navigate('/');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getStudent(regNo);
        if (!cancelled) setStudent(s);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load registration');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regNo, navigate]);

  if (error) {
    return (
      <div className="page">
        <div className="warning-banner">
          {error}
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="page flex-center">
        <div className="spinner spinner-big" />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="glass congrats">
        <div className="badge">
          <Award size={36} />
        </div>
        <h1>Congratulations, {student.fullName.split(' ')[0]}!</h1>
        <p className="text-dim" style={{ maxWidth: 540, margin: '8px auto 0' }}>
          Your registration is complete. We've recorded your payment and saved your seat in{' '}
          <strong style={{ color: '#e8ecff' }}>{student.departmentName}</strong>.
        </p>

        <div className="ref">{student.regNo}</div>

        <div className="summary-list mt-24" style={{ maxWidth: 460, margin: '24px auto 0' }}>
          <div className="row"><span className="label">Department</span><span className="value">{student.departmentName}</span></div>
          <div className="row"><span className="label">Category</span><span className="value">{student.category === 'IT' ? 'IT Student' : 'General Student'}</span></div>
          <div className="row"><span className="label">Amount Paid</span><span className="value" style={{ color: '#4ddbb8' }}>NGN {student.amount.toLocaleString('en-NG')}</span></div>
        </div>

        <div className="flex-center mt-24" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => downloadReceipt(student)}>
            <FileText size={16} /> Download Receipt (PDF)
          </button>
          <button className="btn btn-ghost" onClick={() => downloadTimetable(student)}>
            <Calendar size={16} /> Download Timetable (PDF)
          </button>
          <Link to="/" className="btn btn-ghost">
            <Home size={16} /> Back to home
          </Link>
        </div>

        <div className="text-dim mt-24" style={{ fontSize: 13 }}>
          Tip: a confirmation email is also queued for <strong>{student.email}</strong>.
        </div>
      </div>
    </div>
  );
}
