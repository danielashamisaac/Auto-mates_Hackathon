import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Topbar from './components/Topbar.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Landing from './pages/Landing.jsx';
import CategorySelect from './pages/CategorySelect.jsx';
import DepartmentSelect from './pages/DepartmentSelect.jsx';
import EligibilityTest from './pages/EligibilityTest.jsx';
import CaptureForm from './pages/CaptureForm.jsx';
import Payment from './pages/Payment.jsx';
import Success from './pages/Success.jsx';
import ResumePayment from './pages/ResumePayment.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import { api } from './api.js';

function AdminGuard({ children }) {
  const [state, setState] = useState('loading');
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.adminSession();
        if (!cancelled) setState(res.isAdmin ? 'authed' : 'guest');
      } catch {
        if (!cancelled) setState('guest');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="page flex-center">
        <div className="spinner spinner-big" />
      </div>
    );
  }
  if (state === 'authed') return children;
  return <Navigate to="/admin" state={{ from: location.pathname }} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <Topbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/capture" element={<CategorySelect />} />
        <Route path="/capture/department" element={<DepartmentSelect />} />
        <Route path="/capture/eligibility" element={<EligibilityTest />} />
        <Route path="/capture/form" element={<CaptureForm />} />
        <Route path="/capture/payment" element={<Payment />} />
        <Route path="/capture/success" element={<Success />} />
        <Route path="/payment" element={<ResumePayment />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
